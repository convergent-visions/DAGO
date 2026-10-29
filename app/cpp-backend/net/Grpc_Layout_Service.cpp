#include "Grpc_Layout_Service.hpp"

#include <thread>
#include <boost/filesystem.hpp>
#include <queue>

#include "../graph-preprocessing/assign_levels.h"
#include "../utils/input_generation_for_qap.h"
#include "../data-structures/Pretend_Matrix.hpp"

#include "../algorithms/algorithm_params_creation.hpp"


namespace net {

auto assignLevelsInGraph = graph_preprocessing::assignLevelsInGraph;

template <typename T>
using PretendMatrix = data_structures::PretendMatrix<T>;

grpc::Status GrpcLayoutService::computeGraphLayout(grpc::ServerContext* context, const EdgeList* edgeList, GraphLayout* response) {
    constexpr uint8_t TargetGraphUUIDLength = 7;
    boost::uuids::random_generator graphUUIDGenerator;
    std::string graphUUIDInStrForm = boost::uuids::to_string(graphUUIDGenerator());
    graphUUIDInStrForm = {
        graphUUIDInStrForm.begin(),
        std::next(graphUUIDInStrForm.begin(), TargetGraphUUIDLength)
    };
    logging::log_info(
        "Layout service generated a id for graph: " + graphUUIDInStrForm + "."
    );

    bool computationSuccessful = false;

    std::thread executionThread([
            this, context, edgeList, response, &graphUUIDInStrForm, &computationSuccessful
        ]() -> void {
            std::vector<std::pair<uint32_t, uint32_t>> edgeListInGraphCompatibleForm;
            try {
                size_t numberOfEdges = edgeList->edges_size();
                edgeListInGraphCompatibleForm.reserve(numberOfEdges);

                uint32_t numberOfVertices = 0;
                for (size_t i=0; i<numberOfEdges; ++i) {
                    const Edge& edgeI = edgeList->edges(i);
                    uint32_t u = edgeI.srcvertexindex();
                    uint32_t v = edgeI.destvertexindex();
                    numberOfVertices = std::max(numberOfVertices, u+1);
                    numberOfVertices = std::max(numberOfVertices, v+1);
                    edgeListInGraphCompatibleForm.emplace_back(u, v);
                }

                logging::log_info(
                    "Layout service received new rpc call for a graph with "
                    + std::to_string(numberOfVertices) + " vertices and "
                    + std::to_string(numberOfEdges) + " edges."
                );

                Graph graph(numberOfVertices, edgeListInGraphCompatibleForm, true);

                logging::log_trace(
                    "Assigning levels in graph with id = " + graphUUIDInStrForm + "..."
                );
                assignLevelsInGraph(graph);
                logging::log_debug(
                    "Assigned levels in graph with id = " + graphUUIDInStrForm + "."
                );

                logging::log_trace(
                    "Colouring vertices in graph with id = " + graphUUIDInStrForm + "..."
                );

                auto colouringAlgParams = m_colouringAlgParams;
                auto layoutAlgParams = m_layoutAlgParams;

                if (edgeList->has_layout_params()) {
                    const auto& grpcLayoutParams = edgeList->layout_params();

                    if (grpcLayoutParams.has_graph_colourer()) {
                        const auto& grpcColourerParams =
                            grpcLayoutParams.graph_colourer();

                        algorithms::GraphColourerTuningParams params;

                        params.dEdgesThresholdCoeff =
                            grpcColourerParams.d_edges_threshold_coeff();

                        params.minCumCountOfVertices =
                            grpcColourerParams.min_cum_count_of_vertices();

                        params.mergeCommonVerticesThreshold =
                            grpcColourerParams.merge_common_vertices_threshold();

                        params.minNumberOfVerticesAtStartingLevel =
                            grpcColourerParams.min_number_of_vertices_at_starting_level();

                        colouringAlgParams =
                            algorithms::createGraphColourerAlgParams(params);
                    }

                    if (grpcLayoutParams.has_layout_drawer()) {
                        const auto& grpcDrawerParams =
                            grpcLayoutParams.layout_drawer();

                        algorithms::LayoutDrawerTuningParams params;

                        params.xInterspringWeight =
                            grpcDrawerParams.x_interspring_weight();

                        params.xInterspringPower =
                            grpcDrawerParams.x_interspring_power();

                        params.interspringUpwardsTransferCoeff =
                            grpcDrawerParams.interspring_upwards_transfer_coeff();

                        params.boxWidthCoeff =
                            grpcDrawerParams.box_width_coeff();

                        params.noiseIntervalWidthPercentage =
                            grpcDrawerParams.noise_interval_width_percentage();

                        params.nestedColourChildPadding =
                            grpcDrawerParams.nested_colour_child_padding();

                        params.minRequiredDistanceBetweenAdjacentLevels =
                            grpcDrawerParams
                                .min_required_distance_between_adjacent_levels();

                        layoutAlgParams =
                            algorithms::createLayoutDrawerAlgParams(params);
                    }
                }

                GraphColourer graphColourer(colouringAlgParams);
                graphColourer.setLogGraphId(graphUUIDInStrForm);
                auto&& [colouredGraph, colourHierarchyRootPtr] = graphColourer.assignColoursToGraph(
                    graph, true, m_maxRecursionDepthInGraphColouring
                );
                logging::log_info(
                    "Concluded colouring vertices in graph with id = " + graphUUIDInStrForm + "."
                );

                if (!colourHierarchyRootPtr->childrenPtrs.empty()) {
                    logging::log_trace(
                        "Preparing to run QAP for graph with id = " + graphUUIDInStrForm + "..."
                    );
                    std::string preQAPColourHierarchyString;
                    buildColourHierarchyString(*colourHierarchyRootPtr, preQAPColourHierarchyString);
                    logging::log_info(
                        "Colour hierarchy structure before QAP for graph with id = " +
                        graphUUIDInStrForm + ":\n" + preQAPColourHierarchyString + "."
                    );

                    callQAPPythonScript(colouredGraph, *colourHierarchyRootPtr);
                    // callQAPCppScript(colouredGraph, colourHierarchyRoot);
                    logging::log_info(
                        "Ran QAP for graph with id = " + graphUUIDInStrForm + "."
                    );

                    std::string colourHierarchyString;
                    buildColourHierarchyString(*colourHierarchyRootPtr, colourHierarchyString);
                    logging::log_info(
                        "Result colour hierarchy structure for graph with id = " + graphUUIDInStrForm + ":\n" +
                        colourHierarchyString + "."
                    );
                }

                logging::log_trace(
                    "Computing layout for graph with id = " + graphUUIDInStrForm + "..."
                );

                LayoutDrawer layoutDrawer(layoutAlgParams);
                layoutDrawer.setLogGraphId(graphUUIDInStrForm);
                auto layoutPositons = layoutDrawer.findLayoutForGraph(
                    colouredGraph, *colourHierarchyRootPtr, m_defaultEpsilonInLayoutDrawing
                );

                logging::log_trace("Trimming helper colour roots for " + graphUUIDInStrForm + ".");
                layoutPositons.resize(numberOfVertices); // Trimming vertices that may have been added as helper colour roots
                logging::log_debug("Trimmed helper colour roots for " + graphUUIDInStrForm + ".");
                flipYCoordinates(layoutPositons);
                pushLayoutToFirstQuarterOfCartesianSpace(layoutPositons);
                logging::log_info(
                    "Computed layout for graph with id = " + graphUUIDInStrForm + "."
                );

                response->clear_layoutpositions();
                std::vector<CartesianCoord> layoutPositionsInGrpcCompatibleForm;
                layoutPositionsInGrpcCompatibleForm.reserve(numberOfVertices);
                for (const auto [x, y] : layoutPositons) {
                    CartesianCoord* newLayoutPositionPtr = response->add_layoutpositions();
                    newLayoutPositionPtr->set_x(x);
                    newLayoutPositionPtr->set_y(y);
                }
                logging::log_info(
                    "Finished processing layout computation rpc for graph with id = "
                    + graphUUIDInStrForm + "."
                );
                computationSuccessful = true;
            } catch (const std::exception& e) {
                logging::log_error(
                    "An error occured when trying to compute layout for graph with id = "
                    + graphUUIDInStrForm + ": " + e.what()
                );
            }
    });
    executionThread.join();

    if (computationSuccessful) return grpc::Status::OK;
    else return grpc::Status::CANCELLED;
}


void GrpcLayoutService::fillFileWithColourHierarchy(
    std::ofstream& outputFileStream,
    const GraphColourer::ColourHierarchyNode& colourHierarchyNode,
    uint32_t indent
) const {
    std::string indentStr;
    indentStr.reserve(indent);
    for (uint32_t i=0; i<indent; ++i) indentStr += "-";
    std::cout << indentStr << " " << colourHierarchyNode.colour << "\n";
    outputFileStream << indentStr << " " << colourHierarchyNode.colour << "\n";
    for (const auto& colourNodeChildPtr : colourHierarchyNode.childrenPtrs) {
        fillFileWithColourHierarchy(
            outputFileStream, *colourNodeChildPtr, indent+1
        );
    }
}


void GrpcLayoutService::callQAPPythonScript(
    ColouredGraph& graph,
    GraphColourer::ColourHierarchyNode& colourHierarchyRoot
) const {
    boost::uuids::random_generator graphUUIDGenerator;
    boost::uuids::uuid uuid = graphUUIDGenerator();
    boost::filesystem::path p =
        boost::filesystem::temp_directory_path() /
        boost::filesystem::unique_path("temp-" + boost::uuids::to_string(uuid));

    std::ofstream f(p.string());
    fillFileWithColourHierarchy(f, colourHierarchyRoot);
    auto [F, FPrim] = utils::createFMatricesForColoursQAP(
        colourHierarchyRoot, graph
    );

    f << "\n";
    f << F.getRowCount() << " " << F.getColCount() << "\n";
    f << "\n";

    size_t n = F.getRowCount();
    for (size_t i=0; i<n; ++i) {
        auto& Fi = F.getIthRow(i);
        for (auto it=Fi.begin(); it!=Fi.end(); ++it) {
            auto [j, fij] = it.getIndexAndValuePtr();
            if (*fij != 0) {
                // std::cout << "F " << i << " " << j << " " << *fij << "\n";
                f << "F " << i << " " << j << " " << *fij << "\n";
            }
        }
    }

    f.close();
    callQAPScriptAndModifyColourHierarchy(graph, colourHierarchyRoot, p.string());
    boost::filesystem::remove(p);
}


void GrpcLayoutService::callQAPScriptAndModifyColourHierarchy(
    ColouredGraph& graph,
    GraphColourer::ColourHierarchyNode& colourHierarchyRoot,
    const std::string& colourHierarchyAndFMatrixPathFile
) const {

    // constexpr std::string_view qapPyScriptPath = "/app/py_qap_solving_scripts/qap_solver.py";
    constexpr std::string_view qapPyScriptPath = "/app/py_qap_solving_scripts/biq_bin_qap_solver.py";
    std::string command = "python3 " + std::string(qapPyScriptPath) + " " + colourHierarchyAndFMatrixPathFile;

    std::unique_ptr<FILE, decltype(&pclose)> qapPipe = std::unique_ptr<FILE, decltype(&pclose)>(
        popen(command.c_str(), "r"), pclose
    );

    std::array<char, 1024> buffer = {0};
    std::string readBytes;

    if (!qapPipe) {
        logging::log_warning(
            "Skipping QAP as something went wrong..."
        );

        while (fgets(buffer.data(), buffer.size(), qapPipe.get()) != nullptr) {
            readBytes += buffer.data();
        }

        logging::log_warning("QAP error: " + readBytes + ".");

        return;
    }

    while (fgets(buffer.data(), buffer.size() * sizeof(char), qapPipe.get()) != nullptr) {
        readBytes += buffer.data();
    }

    uint32_t maxColourIndex = 0;
    std::stringstream qapMappingStream(readBytes);
    std::string mapping;
    char* savePtr;
    uint32_t previousColour, newColour;
    while (qapMappingStream >> mapping) {
        std::string previousColourStr = strtok_r(const_cast<char*>(mapping.c_str()), ">", &savePtr);
        previousColour = std::stoi(previousColourStr);
        maxColourIndex = std::max(maxColourIndex, previousColour);
    }

    std::vector<GraphColourer::ColourHierarchyNode*> colourHierarchyNodesPtrs(maxColourIndex+1, nullptr);
    fillVectorOfColourHierarchyNodesPtr(colourHierarchyRoot, colourHierarchyNodesPtrs);

    std::string recolouringStr = "";

    qapMappingStream = std::stringstream(readBytes);
    while (qapMappingStream >> mapping) {
        recolouringStr += (recolouringStr.empty() ? "" : ", ") + mapping;
        std::string previousColourStr = strtok_r(const_cast<char*>(mapping.c_str()), ">", &savePtr);
        std::string newColourStr = strtok_r(nullptr, ">", &savePtr);

        previousColour = std::stoi(previousColourStr);
        newColour = std::stoi(newColourStr);
        auto examinedColourHierarchyNode = colourHierarchyNodesPtrs[previousColour];
        examinedColourHierarchyNode->colour = newColour;
        for (uint32_t vIndex : examinedColourHierarchyNode->verticesOfColour) {
            graph.setVertexColour(vIndex, newColour);
        }
    }

    logging::log_debug(
        "Recolouring in graph: " + recolouringStr + "."
    );
    sortChildrenInColourHierarchyNodeWithRecursion(colourHierarchyRoot);
}


void GrpcLayoutService::fillVectorOfColourHierarchyNodesPtr(
    const GraphColourer::ColourHierarchyNode& colourHierarchyNode,
    std::vector<GraphColourer::ColourHierarchyNode*>& colourHierarchyNodesPtrs
) const {

    uint32_t colour = colourHierarchyNode.colour;
    colourHierarchyNodesPtrs[colour] = const_cast<GraphColourer::ColourHierarchyNode*>(
        &colourHierarchyNode
    );

    for (const auto& colourNodeChildPtr : colourHierarchyNode.childrenPtrs) {
        fillVectorOfColourHierarchyNodesPtr(*colourNodeChildPtr, colourHierarchyNodesPtrs);
    }
}


void GrpcLayoutService::sortChildrenInColourHierarchyNodeWithRecursion(
    GraphColourer::ColourHierarchyNode& colourHierarchyNode
) const {

    if (colourHierarchyNode.childrenPtrs.size() <= 1) return;
    std::sort(
        colourHierarchyNode.childrenPtrs.begin(),
        colourHierarchyNode.childrenPtrs.end(),
        [](
            const std::unique_ptr<GraphColourer::ColourHierarchyNode>& firstChildNodePtr,
            const std::unique_ptr<GraphColourer::ColourHierarchyNode>& secondChildNodePtr
        ) -> bool {
            return firstChildNodePtr->colour < secondChildNodePtr->colour;
        }
    );

    for (auto& colourChildPtr : colourHierarchyNode.childrenPtrs) {
        sortChildrenInColourHierarchyNodeWithRecursion(*colourChildPtr);
    }
}


void GrpcLayoutService::pushLayoutToFirstQuarterOfCartesianSpace(
    std::vector<std::pair<double, double>>& graphLayout, double xPadding, double yPadding
) {
    if (xPadding < 0 || yPadding < 0) {
        throw std::runtime_error{
            "Push Layout to 1st Quarter of Cartesian Space error: both xPadding and yPadding must be positive"
        };
    }
    double minX = std::numeric_limits<double>::max();
    double minY = std::numeric_limits<double>::max();
    uint32_t n = graphLayout.size();
    for (uint32_t uIndex=0; uIndex<n; ++uIndex) {
        const auto& [xu, yu] = graphLayout[uIndex];
        minX = std::min(minX, xu);
        minY = std::min(minY, yu);
    }

    double xPush = std::abs(minX) + xPadding;
    double yPush = std::abs(minY) + yPadding;
    std::pair<double, double> translationVec(xPush, yPush);
    for (uint32_t uIndex=0; uIndex<n; ++uIndex) {
        graphLayout[uIndex] += translationVec;
    }
}


void GrpcLayoutService::buildColourHierarchyString(
    const GraphColourer::ColourHierarchyNode& colourHierarchyNode,
    std::string& colourHierarchyString, uint32_t indent
) const {

    colourHierarchyString += " ";
    for (uint32_t i=0; i<indent; ++i) {
        colourHierarchyString += "-";
    }
    colourHierarchyString += " " + std::to_string(colourHierarchyNode.colour);
    colourHierarchyString += " vertices: [";
    uint32_t n = colourHierarchyNode.verticesOfColour.size();
    for (uint32_t i=0; i<n; ++i) {
        colourHierarchyString += (i == 0 ? "" : ", ") + std::to_string(colourHierarchyNode.verticesOfColour[i]);
    }
    colourHierarchyString += "]\n";

    for (const auto& childNodePtr : colourHierarchyNode.childrenPtrs) {
        buildColourHierarchyString(
            *childNodePtr, colourHierarchyString, indent+1
        );
    }
}

}
