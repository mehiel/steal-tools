var makeBundleGraph = require("./make_graph_with_bundles");
var through = require("through2");
var clone = require("lodash").clone;
var getDependencies = require("../node_trace");
var xor = require("lodash").xor;
var removeActiveSourceKeys = require("./remove_active_source_keys");

/**
 * @module regraph
 * @description Consumes a Dependency Graph and can regenerate another when
 * modules change.
 */
module.exports = function(config){
	var cachedData;

	// Regenerate a new bundle graph and copy over the transforms so they can
	// be reused.
	function regenerate(moduleName, done){
		var cfg = clone(config, true);
		makeBundleGraph(cfg).then(function(data){
			var graph = data.graph;
			var oldGraph = cachedData.graph;
			for(var name in graph){
				if(name !== moduleName && oldGraph[name]) {
					graph[name].transforms = oldGraph[name].transforms;
				}
			}
			cachedData = cloneData(data);
			done(null, data);
		}, done);
	}

	function clean(node, newSource) {
		node.load.source = newSource;
		delete node.transforms;
		delete node.sourceNode;
	}

	function cloneData(data) {
		var newData = clone(data);
		newData.graph = clone(newData.graph);
		return newData;
	}

	function cached(data, enc, next){
		// This will only happen the first time, just to cache.
		if(typeof data === "object") {
			// Looks like:
			// { graph, steal, loader, buildLoader, mains }
			cachedData = cloneData(data);
			next(null, data);
		} else {
			var moduleName = data;

			// Get the old node and check to see if it has any new dependencies,
			// if so just regenerate the entire graph.
			var node = cachedData.graph[moduleName];
			if(node) {
				getDependencies(node.load).then(function(result){
					// If the deps are the same we can return the existing graph.
					if(same(node.deps, result.deps)) {
						clean(node, result.source);
						removeActiveSourceKeys(cachedData.graph);
						cachedData = cloneData(cachedData);
						return next(null, cachedData);
					}
					regenerate(moduleName, next);
				}, function(err){
					err.moduleName = moduleName;
					next(err);
				});
			} else {
				regenerate(null, next);
			}
		}
	}

	return through.obj(cached);
};

function same(a, b){
	return !xor(a, b).length;
}
