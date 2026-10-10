import { apiGet } from './client';

export type HealthResponse = {
  status: string;
};

export type DatabaseHealthResponse = {
  status: string;
  database: string;
};

/** Is the API process up? */
export function getHealth(): Promise<HealthResponse> {
  return apiGet<HealthResponse>('/health');
}

/** Can the API reach its database? */
export function getDatabaseHealth(): Promise<DatabaseHealthResponse> {
  return apiGet<DatabaseHealthResponse>('/health/db');
}
