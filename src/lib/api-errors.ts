/** Safe-to-return client errors (validation, conflict, etc.). */
export class ClientError extends Error {
	status: number;

	constructor(message: string, status = 400) {
		super(message);
		this.name = "ClientError";
		this.status = status;
	}
}

export function isClientError(error: unknown): error is ClientError {
	return error instanceof ClientError;
}

/**
 * Map thrown errors to a public message. Logs diagnostics server-side;
 * never returns raw provider/internal exception text.
 */
export function publicApiError(
	error: unknown,
	fallback: string,
	logLabel: string,
): { message: string; status: number } {
	if (isClientError(error)) {
		return { message: error.message, status: error.status };
	}

	console.error(`[${logLabel}]`, error);
	return { message: fallback, status: 400 };
}
