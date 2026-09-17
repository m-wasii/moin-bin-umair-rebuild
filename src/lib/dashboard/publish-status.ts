/**
 * Publish lifecycle UI language (Phase 2 / 3B).
 * Catalog save and public HTML refresh are distinct steps.
 */
import type { SiteCacheRefreshResult } from "../site-cache";

export type PublishLifecycle =
	"catalog-saved" | "site-updating" | "public-live" | "refresh-failed";

export interface PublishStatusView {
	lifecycle: PublishLifecycle;
	label: string;
	tone: "neutral" | "info" | "success" | "warning" | "danger";
	detail?: string;
}

/** Honest refresh state exposed on mutation API responses (Videos first). */
export type PublishRefreshState = "skipped" | "public-live" | "refresh-failed";

export interface MutationPublishPayload {
	catalog: "saved";
	refresh: PublishRefreshState;
	detail?: string;
}

const LABELS: Record<PublishLifecycle, PublishStatusView["label"]> = {
	"catalog-saved": "Catalog saved",
	"site-updating": "Site updating",
	"public-live": "Public live",
	"refresh-failed": "Refresh failed",
};

const TONES: Record<PublishLifecycle, PublishStatusView["tone"]> = {
	"catalog-saved": "info",
	"site-updating": "warning",
	"public-live": "success",
	"refresh-failed": "danger",
};

export function publishStatusView(
	lifecycle: PublishLifecycle,
	detail?: string,
): PublishStatusView {
	return {
		lifecycle,
		label: LABELS[lifecycle],
		tone: TONES[lifecycle],
		detail,
	};
}

/**
 * Map a real cache refresh result to the mutation `publish` payload.
 * Never claims `public-live` unless purge and warm both succeeded.
 * DEV / missing origin → `skipped` (honest).
 */
export function mutationPublishFromRefresh(
	refresh: SiteCacheRefreshResult,
): MutationPublishPayload {
	if (refresh.status === "skipped-dev") {
		return { catalog: "saved", refresh: "skipped", detail: "dev" };
	}
	if (refresh.status === "skipped-no-origin") {
		return {
			catalog: "saved",
			refresh: "skipped",
			detail: "No public site origin",
		};
	}
	if (refresh.status === "success" && refresh.purged && refresh.warmed) {
		return { catalog: "saved", refresh: "public-live" };
	}
	if (refresh.status === "partial") {
		return {
			catalog: "saved",
			refresh: "refresh-failed",
			detail: refresh.detail ?? "Cache refresh incomplete",
		};
	}
	return {
		catalog: "saved",
		refresh: "refresh-failed",
		detail: refresh.detail ?? "Cache refresh failed",
	};
}

/** Map API `publish.refresh` → existing PublishLifecycle views for the dashboard. */
export function publishStatusFromApiRefresh(
	refresh: PublishRefreshState,
	detail?: string,
): PublishStatusView {
	if (refresh === "public-live")
		return publishStatusView("public-live", detail);
	if (refresh === "refresh-failed") {
		return publishStatusView("refresh-failed", detail);
	}
	// skipped (DEV / no origin): catalog wrote; public refresh did not run
	return publishStatusView("catalog-saved", detail);
}
