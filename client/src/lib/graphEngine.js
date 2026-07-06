/**
 * Graph Intelligence Engine
 * 
 * Pure client-side graph algorithms for recovery-chain analysis.
 * All operations run in browser memory — nothing leaves the device.
 * 
 * Features:
 * - Recovery chain graph construction
 * - BFS blast-radius simulation ("What if I lost this?")
 * - Degree centrality for single-point-of-failure detection
 * - Panic mode prioritized breach response plan
 */

import { getCachedBreachCount } from './hibp';

/**
 * Build a directed graph from vault entries' recovery relationships.
 * 
 * Nodes = email addresses (usernames that contain @)
 * Edges = recovery relationships (account → its recovery email)
 * 
 * @param {Array} entries - Decrypted vault entries
 * @returns {{ adjacency: Object, reverseAdj: Object, nodeData: Object }}
 */
export const buildRecoveryGraph = (entries) => {
  const adjacency = {};    // node → [nodes it recovers TO]
  const reverseAdj = {};   // node → [nodes that recover VIA this node]
  const nodeData = {};     // node → entry metadata

  entries.forEach(entry => {
    const email = (entry.username || '').toLowerCase().trim();
    const recovery = (entry.recoveryEmail || '').toLowerCase().trim();

    if (!email) return;

    // Register node
    if (!adjacency[email]) adjacency[email] = [];
    if (!reverseAdj[email]) reverseAdj[email] = [];
    
    nodeData[email] = {
      id: entry.id,
      serviceName: entry.serviceName,
      username: entry.username,
      url: entry.url,
      category: entry.category,
      twoFactorMethod: entry.twoFactorMethod || 'none',
      backupCodes: !!entry.backupCodes,
      recoveryEmail: entry.recoveryEmail,
      recoveryPhone: entry.recoveryPhone,
    };

    // Create edge: this account → its recovery email
    if (recovery && recovery.includes('@')) {
      if (!adjacency[recovery]) adjacency[recovery] = [];
      if (!reverseAdj[recovery]) reverseAdj[recovery] = [];

      // "recovery" can recover "email" — so if recovery is lost, email is at risk
      reverseAdj[recovery].push(email);
      adjacency[email].push(recovery);
    }
  });

  return { adjacency, reverseAdj, nodeData };
};

/**
 * BFS blast-radius simulation.
 * 
 * "What if I lost access to this account?"
 * Traverses the reverse adjacency graph to find all accounts
 * that would become unrecoverable if the given node is lost.
 * 
 * @param {{ reverseAdj: Object, nodeData: Object }} graph
 * @param {string} startNode - The email/account to simulate losing
 * @returns {{ affectedNodes: string[], depth: Object }}
 */
export const blastRadiusBFS = (graph, startNode) => {
  const { reverseAdj, nodeData } = graph;
  const visited = new Set();
  const queue = [{ node: startNode, depth: 0 }];
  const affectedNodes = [];
  const depthMap = {};

  visited.add(startNode);

  while (queue.length > 0) {
    const { node, depth } = queue.shift();
    
    affectedNodes.push(node);
    depthMap[node] = depth;

    // Find all accounts that use this node as their recovery
    const dependents = reverseAdj[node] || [];
    for (const dependent of dependents) {
      if (!visited.has(dependent)) {
        // Check if this dependent has alternative recovery paths
        const depData = nodeData[dependent];
        const hasPhone = depData?.recoveryPhone;
        const hasBackup = depData?.backupCodes;
        const has2FA = depData?.twoFactorMethod && depData.twoFactorMethod !== 'none';

        // If no alternative recovery, this account is at risk
        if (!hasPhone && !hasBackup) {
          visited.add(dependent);
          queue.push({ node: dependent, depth: depth + 1 });
        }
      }
    }
  }

  return { affectedNodes, depthMap };
};

/**
 * Compute degree centrality for each node.
 * 
 * Centrality = (in-degree + out-degree) / (total nodes - 1)
 * Higher score = more accounts depend on this one = bigger SPOF risk.
 * 
 * Also computes a "blast radius score" using BFS from each node.
 * 
 * @param {{ adjacency: Object, reverseAdj: Object, nodeData: Object }} graph
 * @returns {Array<{ node: string, centrality: number, blastRadius: number, data: Object }>}
 */
export const computeDegreeCentrality = (graph) => {
  const { adjacency, reverseAdj, nodeData } = graph;
  const allNodes = new Set([...Object.keys(adjacency), ...Object.keys(reverseAdj)]);
  const totalNodes = allNodes.size;

  if (totalNodes <= 1) return [];

  const results = [];

  allNodes.forEach(node => {
    const inDegree = (reverseAdj[node] || []).length;
    const outDegree = (adjacency[node] || []).length;
    const centrality = (inDegree + outDegree) / (totalNodes - 1);

    // Compute blast radius
    const { affectedNodes } = blastRadiusBFS(graph, node);
    const blastRadius = affectedNodes.length - 1; // exclude self

    results.push({
      node,
      centrality: Math.min(centrality, 1),
      blastRadius,
      inDegree,
      outDegree,
      data: nodeData[node] || { serviceName: node.split('@')[1] || node },
    });
  });

  // Sort by blast radius (descending), then centrality
  results.sort((a, b) => b.blastRadius - a.blastRadius || b.centrality - a.centrality);

  return results;
};

/**
 * Generate a prioritized Panic Mode breach response plan.
 * 
 * When a user thinks they've been compromised, this orders
 * all accounts by impact severity for password rotation.
 * 
 * Priority order:
 * 1. Hub accounts (highest centrality) — rotate these FIRST
 * 2. Accounts with no 2FA — most vulnerable
 * 3. Banking/financial accounts — highest real-world impact
 * 4. Everything else by blast radius
 * 
 * @param {Array} entries - All decrypted vault entries
 * @param {{ adjacency: Object, reverseAdj: Object, nodeData: Object }} graph
 * @returns {Array<{ entry: Object, priority: string, reason: string, order: number }>}
 */
export const generatePanicPlan = (entries, graph) => {
  const centralityRanking = computeDegreeCentrality(graph);
  const centralityMap = {};
  centralityRanking.forEach(item => {
    centralityMap[item.node] = item;
  });

  const plan = entries.map(entry => {
    const email = (entry.username || '').toLowerCase().trim();
    const centralityData = centralityMap[email];
    const blastRadius = centralityData?.blastRadius || 0;
    const centrality = centralityData?.centrality || 0;
    const has2FA = entry.twoFactorMethod && entry.twoFactorMethod !== 'none';
    const isBanking = entry.category === 'banking';
    const isHub = centrality > 0.3 || blastRadius >= 2;

    const cachedBreaches = getCachedBreachCount(entry.password) || 0;
    const isBreached = cachedBreaches > 0;

    let score = 0;
    let priority = 'low';
    let reason = '';

    if (isHub) {
      score = 100 + blastRadius * 10;
      priority = 'critical';
      if (isBreached) {
        score += 30;
        reason = `Critical Hub and Leaked password (${cachedBreaches} times) — extreme compromise risk!`;
      } else {
        reason = `Hub account — ${blastRadius} other accounts depend on this for recovery`;
      }
    } else if (isBreached) {
      score = 90;
      priority = 'critical';
      reason = `Password leaked ${cachedBreaches} times in public databases — rotate immediately!`;
    } else if (isBanking) {
      score = 80;
      priority = 'high';
      reason = 'Financial account — direct monetary risk';
    } else if (!has2FA) {
      score = 60;
      priority = 'high';
      reason = 'No 2FA configured — vulnerable to credential stuffing';
    } else if (blastRadius >= 1) {
      score = 40 + blastRadius * 5;
      priority = 'medium';
      reason = `${blastRadius} account(s) use this for recovery`;
    } else {
      score = 10;
      priority = 'low';
      reason = 'Isolated account with no downstream dependencies';
    }

    return { entry, priority, reason, score, has2FA, blastRadius, isBreached };
  });

  plan.sort((a, b) => b.score - a.score);

  return plan.map((item, idx) => ({
    ...item,
    order: idx + 1,
  }));
};
