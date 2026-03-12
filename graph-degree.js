/**
 * Graph from Question 1: Graph Degree
 * Nodes A–F with undirected edges
 */

// Adjacency list (each edge stored once per endpoint)
const graph = {
  A: ["B", "C", "D", "F"],
  B: ["A", "C", "D"],
  C: ["A", "B", "D", "F"],
  D: ["A", "B", "C", "E", "F"],
  E: ["D", "F"],
  F: ["A", "C", "D", "E"],
};

function degree(node) {
  return graph[node]?.length ?? 0;
}

function minMaxAvgDegree() {
  const nodes = Object.keys(graph);
  const degrees = nodes.map((n) => degree(n));
  const min = Math.min(...degrees);
  const max = Math.max(...degrees);
  const avg = Math.floor(
    degrees.reduce((a, b) => a + b, 0) / degrees.length
  );
  return { min, max, avg };
}

// Run
const { min, max, avg } = minMaxAvgDegree();
console.log("Graph:", graph);
console.log("Degrees:", Object.fromEntries(Object.keys(graph).map((n) => [n, degree(n)])));
console.log("min =", min);
console.log("max =", max);
console.log("avg =", avg);
