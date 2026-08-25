/**
 * The one name shared by the server that sets the header and the client that
 * reads it. Its own module because everything else in Security/ is server-only,
 * and importing any of that from the browser would drag the API key's module
 * graph along with it.
 *
 * Value: whole seconds until the gateway should be usable again.
 */
export const SERVICE_BUSY_HEADER = 'x-service-busy'
