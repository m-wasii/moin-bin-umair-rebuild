/**
 * Expose catalog revision map for future workspace mutations.
 * Does not rewrite existing mutation flows in Phase 3A.
 */
(function () {
	const node = document.getElementById("dash-revision-bootstrap");
	if (!node?.textContent) {
		window.DashRevisions = {
			map: null,
			get() {
				return null;
			},
			payload() {
				return null;
			},
		};
		return;
	}

	let map = null;
	try {
		map = JSON.parse(node.textContent);
	} catch {
		map = null;
	}

	window.DashRevisions = {
		map,
		get(domain) {
			return map?.[domain] ?? null;
		},
		/** Shape suitable for If-Match / JSON `rev` on future mutations. */
		payload(domain) {
			const revision = map?.[domain];
			if (!revision) return null;
			const out = { rev: revision.rev ?? 0 };
			if (revision.etag) out.etag = revision.etag;
			return out;
		},
		set(domain, next) {
			if (!map) map = {};
			map[domain] = next;
			window.DashRevisions.map = map;
		},
	};
})();
