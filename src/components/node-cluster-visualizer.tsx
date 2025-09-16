'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { getNodesForHexagon, buildRoadGraph, type NodesInHexResult, type NodeCluster, type RoadGraph } from '@/app/osm-actions';

export function NodeClusterVisualizer() {
  const [hexIndex, setHexIndex] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<NodesInHexResult | null>(null);
  const [graph, setGraph] = useState<RoadGraph | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFetchNodes = async () => {
    if (!hexIndex.trim()) {
      setError('Please enter a hex index');
      return;
    }

    setLoading(true);
    setError(null);
    
    try {
      const nodesResult = await getNodesForHexagon(hexIndex);
      setResult(nodesResult);
      
      // Build graph structure
      const roadGraph = buildRoadGraph(nodesResult);
      setGraph(roadGraph);
      
      console.log('Nodes result:', nodesResult);
      console.log('Road graph:', roadGraph);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch nodes');
    } finally {
      setLoading(false);
    }
  };

  const formatDistance = (meters: number): string => {
    if (meters < 1000) {
      return `${Math.round(meters)}m`;
    }
    return `${(meters / 1000).toFixed(2)}km`;
  };

  const getClusterColor = (index: number): string => {
    const colors = [
      'bg-blue-100 text-blue-800',
      'bg-green-100 text-green-800', 
      'bg-yellow-100 text-yellow-800',
      'bg-purple-100 text-purple-800',
      'bg-pink-100 text-pink-800',
      'bg-indigo-100 text-indigo-800',
      'bg-red-100 text-red-800',
      'bg-orange-100 text-orange-800'
    ];
    return colors[index % colors.length];
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Road Node Cluster Analyzer</CardTitle>
          <CardDescription>
            Fetch OSM nodes along roads within a hexagon and create clusters of 225-270 meters for route optimization
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex gap-2">
            <Input
              placeholder="Enter hex index (e.g., 8a2a1072b59ffff)"
              value={hexIndex}
              onChange={(e) => setHexIndex(e.target.value)}
              className="flex-1"
            />
            <Button 
              onClick={handleFetchNodes} 
              disabled={loading}
            >
              {loading ? 'Analyzing...' : 'Fetch Nodes'}
            </Button>
          </div>
          
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-md text-red-700">
              {error}
            </div>
          )}
        </CardContent>
      </Card>

      {result && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Summary Statistics */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Summary</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="flex justify-between">
                <span>Total Nodes:</span>
                <Badge variant="secondary">{result.totalNodes}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Road Segments:</span>
                <Badge variant="secondary">{result.segments.length}</Badge>
              </div>
              <div className="flex justify-between">
                <span>Clusters (225-270m):</span>
                <Badge variant="secondary">{result.clusters.length}</Badge>
              </div>
              {graph && (
                <div className="flex justify-between">
                  <span>Graph Edges:</span>
                  <Badge variant="secondary">
                    {Array.from(graph.nodes.values()).reduce((total, node) => total + node.edges.length, 0)}
                  </Badge>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Cluster Details */}
          {result.clusters.map((cluster, index) => (
            <Card key={cluster.id}>
              <CardHeader>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Badge className={getClusterColor(index)}>
                    Cluster {index + 1}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <div className="flex justify-between">
                  <span>Length:</span>
                  <Badge variant="outline">{formatDistance(cluster.totalLengthMeters)}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Nodes:</span>
                  <Badge variant="outline">{cluster.nodes.length}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Segments:</span>
                  <Badge variant="outline">{cluster.segments.length}</Badge>
                </div>
                <div className="text-xs text-gray-500 mt-2">
                  <div>Centroid:</div>
                  <div>{cluster.centroid.lat.toFixed(6)}, {cluster.centroid.lng.toFixed(6)}</div>
                </div>
                
                {/* Time estimation for 15 minutes */}
                <div className="mt-3 p-2 bg-gray-50 rounded-md">
                  <div className="text-sm font-medium">15-minute coverage:</div>
                  <div className="text-xs text-gray-600">
                    At 20 km/h: {formatDistance(cluster.totalLengthMeters)} 
                    {cluster.totalLengthMeters >= 225 && cluster.totalLengthMeters <= 270 ? 
                      ' ✅ Optimal' : ' ⚠️ Suboptimal'}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {result && result.clusters.length === 0 && (
        <Card>
          <CardContent className="text-center py-8">
            <div className="text-gray-500">
              No clusters found meeting the 225-270 meter criteria in this hexagon.
              <br />
              Try a different hexagon with more road density.
            </div>
          </CardContent>
        </Card>
      )}

      {graph && result && result.clusters.length > 1 && (
        <Card>
          <CardHeader>
            <CardTitle>Cluster Adjacency Matrix</CardTitle>
            <CardDescription>
              Distances between cluster centroids for route optimization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr>
                    <th className="p-2 border"></th>
                    {result.clusters.map((_, i) => (
                      <th key={i} className="p-2 border text-center">C{i + 1}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {graph.adjacencyMatrix.map((row, i) => (
                    <tr key={i}>
                      <th className="p-2 border text-center">C{i + 1}</th>
                      {row.map((distance, j) => (
                        <td key={j} className="p-2 border text-center">
                          {distance === 0 ? '-' : formatDistance(distance)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}



