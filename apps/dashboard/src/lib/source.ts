import { config } from "./config";
import { liveApi } from "./api";
import { mockApi } from "./mock";
import type { DataSource } from "./types";

/**
 * The active data source is chosen ONCE at module load from the explicit demo
 * flag. There is no runtime path from `liveApi` to `mockApi`, so production
 * builds cannot silently serve mock data.
 */
export const dataSource: DataSource = config.demoMode ? mockApi : liveApi;
