# DAGO — Explore Large Directed Acyclic Graphs

DAGO is an interactive application for exploring directed acyclic graphs with focus for Gene Ontology ([GO](https://geneontology.org/docs/ontology-documentation/)). It helps researchers navigate from broad biological concepts to specific terms, inspect relationships, and examine branches of the ontology in a shared graph view.

You can search term metadata, inspect individual terms, mark favorites, add comments, and adjust the graph layout. Graphs can be saved to the application's database or exported for later use.

[View the application demonstration](docs/gifs/demo.gif).

## Start exploring

### 1. Choose an ontology file

Download an OBO file from the [official GO downloads page](https://geneontology.org/docs/download-ontology/).

DAGO currently imports **only `is_a` relationships**. Other relationships present in the source file, including `part_of` and regulatory relationships, are excluded from the displayed graph.

### 2. Load a GO aspect

Upload the OBO file and select **Biological Process**, **Molecular Function**, or **Cellular Component**.

Choose a layout:

- **Hierarchical** arranges terms by graph level and organizes branches into separate regions.
- **Radial** arranges the hierarchy around a central root.

### 3. Find and inspect terms

Search using the available metadata fields, such as a term name or GO identifier. Select a term to inspect its metadata and explore its connections.

Favorites and comments can help keep track of terms during exploration.

### 4. Adjust the view

For a loaded graph, open the change-view dialog and select the hierarchical layout to adjust:

| Setting | Effect |
|---|---|
| **Layout width** | Changes the horizontal space allocated to groups |
| **Minimum level spacing** | Sets the minimum vertical distance between levels |
| **Subgroup spacing** | Changes the horizontal gaps between nested groups |

## Save and share your work

DAGO provides several ways to retain a graph:

- **Save to the application database** to reopen a stored graph.
- **Export as JSON** to retain graph connections, term metadata, and layout coordinates.
- **Export as HTML** to create a standalone browser view.

The JSON export uses DAGO's graph format. It is not an OBO file or the official GO JSON format, and it does not preserve the complete source ontology.

## Run DAGO locally

Install Docker with Docker Compose support, then run:

```bash
git clone --recurse-submodules https://github.com/convergent-visions/DAGO.git
cd DAGO
docker compose up --build
```

Once the services are ready, open [DAGO in your browser](http://localhost:30306).

For a server deployment, copy `.env.example` to `.env`, configure the deployment values, and use:

```bash
docker compose -f docker-compose.prod.yml --env-file .env up -d --build
```

## Feedback and contributors

Report bugs, unclear behavior, or suggestions through [GitHub Issues](https://github.com/convergent-visions/DAGO/issues).

DAGO is developed by:

- [Jakub Grześ](https://github.com/jgrzes)
- [Jan Masternak](https://github.com/janmast1o)
- [Tomasz Smyda](https://github.com/tsmyda)
