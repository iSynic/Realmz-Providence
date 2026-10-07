use super::{water_budget::Budget, water_domains, water_solver::Failure};

pub(super) type Neighbors = Vec<[Option<usize>; 4]>;
type Link = (usize, usize, usize);

pub(super) struct Topology {
    links: Vec<Link>,
    graph: Vec<Vec<(usize, usize)>>,
    components: Vec<usize>,
}

impl Topology {
    pub fn new(
        neighbors: &Neighbors,
        domains: &[u64],
        budget: &mut Budget,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<Self, Failure> {
        let groups = contracted_groups(neighbors, domains, budget, canceled)?;
        let count = groups.iter().max().map_or(0, |node| node + 1);
        let mut links = vec![];
        let mut graph = vec![vec![]; count];
        for (cell, adjacent) in neighbors.iter().enumerate() {
            for (d, other) in adjacent.iter().enumerate() {
                let Some(other) = *other else {
                    continue;
                };
                let (a, b) = (groups[cell], groups[other]);
                if cell >= other || a == b {
                    continue;
                }
                let edge = links.len();
                links.push((cell, other, d));
                graph[a].push((edge, b));
                graph[b].push((edge, a));
            }
        }
        let components = components(&graph);
        Ok(Self {
            links,
            graph,
            components,
        })
    }

    // A potential bridge must carry water in every connected completion. Dry
    // contacts remain valid when another possible wet route goes around them.
    pub fn bridges(
        &self,
        domains: &[u64],
        budget: &mut Budget,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<Vec<Link>, Failure> {
        let mut active = vec![false; self.links.len()];
        for (i, &(a, b, d)) in self.links.iter().enumerate() {
            if canceled() {
                return Err(Failure::Canceled);
            }
            budget.charge(5)?;
            active[i] = water_domains::wet_support(domains[a], d) & domains[b] != 0;
        }
        let mut traversal = Traversal::new(self.graph.len());
        for node in 0..self.graph.len() {
            if traversal.seen[node] != usize::MAX {
                continue;
            }
            if self.components[node] != node {
                return Err(Failure::Impossible);
            }
            traversal.visit(self, &active, node, budget, canceled)?;
        }
        Ok(traversal
            .bridges
            .into_iter()
            .map(|edge| self.links[edge])
            .collect())
    }
}

struct Traversal {
    seen: Vec<usize>,
    low: Vec<usize>,
    parent: Vec<(usize, usize)>,
    bridges: Vec<usize>,
    clock: usize,
}

impl Traversal {
    fn new(size: usize) -> Self {
        Self {
            seen: vec![usize::MAX; size],
            low: vec![usize::MAX; size],
            parent: vec![(usize::MAX, usize::MAX); size],
            bridges: vec![],
            clock: 0,
        }
    }

    fn discover(&mut self, node: usize) {
        self.seen[node] = self.clock;
        self.low[node] = self.clock;
        self.clock += 1;
    }

    fn visit(
        &mut self,
        topology: &Topology,
        active: &[bool],
        start: usize,
        budget: &mut Budget,
        canceled: &mut impl FnMut() -> bool,
    ) -> Result<(), Failure> {
        self.discover(start);
        let mut stack = vec![(start, 0)];
        while let Some((node, next)) = stack.last_mut() {
            if canceled() {
                return Err(Failure::Canceled);
            }
            budget.charge(1)?;
            let node = *node;
            if *next == topology.graph[node].len() {
                stack.pop();
                let (p, edge) = self.parent[node];
                if p != usize::MAX {
                    self.low[p] = self.low[p].min(self.low[node]);
                    if self.low[node] > self.seen[p] {
                        self.bridges.push(edge);
                    }
                }
                continue;
            }
            let (edge, other) = topology.graph[node][*next];
            *next += 1;
            if !active[edge] || edge == self.parent[node].1 {
                continue;
            }
            if self.seen[other] == usize::MAX {
                self.parent[other] = (node, edge);
                self.discover(other);
                stack.push((other, 0));
            } else {
                self.low[node] = self.low[node].min(self.seen[other]);
            }
        }
        Ok(())
    }
}

fn root(groups: &mut [usize], mut node: usize) -> usize {
    while groups[node] != node {
        groups[node] = groups[groups[node]];
        node = groups[node];
    }
    node
}

fn components(graph: &[Vec<(usize, usize)>]) -> Vec<usize> {
    let mut labels = vec![usize::MAX; graph.len()];
    for start in 0..graph.len() {
        if labels[start] != usize::MAX {
            continue;
        }
        labels[start] = start;
        let mut stack = vec![start];
        while let Some(node) = stack.pop() {
            for &(_, other) in &graph[node] {
                if labels[other] == usize::MAX {
                    labels[other] = start;
                    stack.push(other);
                }
            }
        }
    }
    labels
}

fn contracted_groups(
    neighbors: &Neighbors,
    domains: &[u64],
    budget: &mut Budget,
    canceled: &mut impl FnMut() -> bool,
) -> Result<Vec<usize>, Failure> {
    let mut groups = (0..domains.len()).collect::<Vec<_>>();
    for (cell, adjacent) in neighbors.iter().enumerate() {
        if canceled() {
            return Err(Failure::Canceled);
        }
        for (d, other) in adjacent.iter().enumerate() {
            let Some(other) = *other else {
                continue;
            };
            if cell > other {
                continue;
            }
            budget.charge(2)?;
            if domains[cell] & !water_domains::wet_domain(d) == 0
                && domains[other] & !water_domains::wet_domain((d + 2) % 4) == 0
            {
                let a = root(&mut groups, cell);
                let b = root(&mut groups, other);
                groups[b] = a;
            }
        }
    }
    // Guaranteed wet connections stay valid under all later narrowing and
    // backtracking. Contract them once instead of rescanning lake interiors.
    let mut nodes = vec![usize::MAX; domains.len()];
    let mut count = 0;
    for cell in 0..domains.len() {
        let group = root(&mut groups, cell);
        if nodes[group] == usize::MAX {
            nodes[group] = count;
            count += 1;
        }
        groups[cell] = group;
    }
    Ok(groups.into_iter().map(|group| nodes[group]).collect())
}
