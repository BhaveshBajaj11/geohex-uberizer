# Road Node Clustering for Salesman Route Optimization

## Overview

This feature extends the GeoHex Uberizer to fetch OpenStreetMap (OSM) road nodes and create optimized clusters for traveling salesman route planning. The system creates clusters of road segments with lengths between 225-270 meters, which are ideal for 15-minute service intervals.

## Features

### 1. Node Extraction
- Fetches road nodes from OpenStreetMap within hexagonal boundaries
- Extracts both highway and railway nodes
- Filters nodes to ensure they're within the specified hexagon

### 2. Road Segment Analysis
- Creates segments from consecutive nodes along ways
- Calculates actual distances between nodes using Haversine formula
- Groups nodes into meaningful road segments

### 3. Intelligent Clustering
- Groups road segments into clusters with optimal length (225-270 meters)
- Uses graph traversal to find connected segments
- Ensures clusters meet minimum and maximum length requirements
- Calculates cluster centroids for route planning

### 4. Graph Structure
- Builds a connected graph of all nodes and their relationships
- Creates adjacency matrix for cluster-to-cluster distances
- Implements Dijkstra's algorithm for pathfinding between clusters

## API Endpoints

### `/api/osm/nodes` (POST)
Fetches nodes and clusters for a single hexagon.

**Request:**
```json
{
  "hexIndex": "8a2a1072b59ffff"
}
```

**Response:**
```json
{
  "hexIndex": "8a2a1072b59ffff",
  "nodes": [...],
  "segments": [...],
  "clusters": [...],
  "totalNodes": 156
}
```

### `/api/osm/nodes-polygon` (POST)
Fetches nodes and clusters for multiple hexagons within a polygon.

**Request:**
```json
{
  "polygon": [{"lat": 40.7, "lng": -74.0}, ...],
  "hexIndexes": ["8a2a1072b59ffff", ...]
}
```

## Usage

### 1. Access the Node Analysis Tab
Navigate to the "Node Analysis" tab in the sidebar to use the clustering functionality.

### 2. Enter a Hex Index
Input a valid H3 hex index (e.g., `8a2a1072b59ffff`) and click "Fetch Nodes".

### 3. Analyze Results
The system will display:
- **Summary statistics**: Total nodes, segments, and clusters
- **Cluster details**: Length, node count, and time estimates
- **Adjacency matrix**: Distances between clusters for route optimization

### 4. Integration with Scheduling
Clusters with optimal length (225-270 meters) are marked as suitable for 15-minute service intervals, perfect for delivery route planning.

## Technical Implementation

### Data Types

```typescript
type OSMNode = {
  id: string;
  lat: number;
  lng: number;
  roadSegments: string[];
};

type RoadSegment = {
  id: string;
  nodes: OSMNode[];
  lengthMeters: number;
  wayId: string;
};

type NodeCluster = {
  id: string;
  nodes: OSMNode[];
  totalLengthMeters: number;
  segments: RoadSegment[];
  centroid: LatLng;
};
```

### Clustering Algorithm

1. **Start with individual segments**: Each road segment becomes a potential cluster
2. **Iterative expansion**: Try to add adjacent segments until reaching max length (270m)
3. **Connection checking**: Only add segments that share nodes with the current cluster
4. **Length validation**: Keep only clusters meeting minimum length requirement (225m)
5. **Centroid calculation**: Compute average position for route planning

### Graph Operations

```typescript
// Build a graph from nodes result
const graph = buildRoadGraph(nodesResult);

// Find shortest path between clusters
const path = findShortestPathBetweenClusters(graph, "cluster_1", "cluster_2");
```

## Optimization Features

### 15-Minute Service Intervals
The 225-270 meter cluster length is optimized for:
- **Walking speed**: ~4-5 km/h for door-to-door delivery
- **Service time**: 15 minutes total including travel between stops
- **Coverage efficiency**: Maximum area coverage with minimal travel time

### Route Planning Integration
- Clusters serve as waypoints for traveling salesman optimization
- Adjacency matrix provides distances for route algorithms
- Graph structure enables pathfinding between non-adjacent clusters

## Benefits

1. **Optimized Coverage**: Ensures complete road network coverage within hexagons
2. **Time Efficiency**: 15-minute intervals match typical service requirements
3. **Scalable**: Works with single hexagons or large polygon areas
4. **Graph-Ready**: Provides data structures ready for advanced routing algorithms
5. **Visual Feedback**: Color-coded clusters show optimization status

## Future Enhancements

- Integration with real-time traffic data
- Support for one-way streets and turn restrictions
- Machine learning for demand-based cluster sizing
- Integration with external routing services (Google Maps, Mapbox)



