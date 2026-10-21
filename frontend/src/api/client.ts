const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const LOCAL_HOSTNAMES = new Set(["localhost", "127.0.0.1"]);

function getApiBase(): string {
  if (!API_BASE) return "";

  const apiUrl = new URL(API_BASE, window.location.origin);
  const pageHostname = window.location.hostname.toLowerCase();

  // Flask's session cookie must use the same loopback hostname as the frontend.
  if (
    LOCAL_HOSTNAMES.has(pageHostname) &&
    LOCAL_HOSTNAMES.has(apiUrl.hostname.toLowerCase())
  ) {
    apiUrl.hostname = pageHostname;
  }

  return apiUrl.toString().replace(/\/+$/, "");
}

export class ApiError extends Error {
  status: number;
  data: unknown;

  constructor(message: string, status: number, data?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
  }
}

function buildUrl(path: string, params?: Record<string, string | number | boolean | undefined | null>): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const base = getApiBase();
  const url = new URL(`${base}${normalizedPath}`, window.location.origin);

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== "") {
        url.searchParams.append(key, String(value));
      }
    });
  }

  // If an API base was provided, return the full absolute string; else path + query.
  if (base) {
    return url.toString();
  }
  return `${url.pathname}${url.search}`;
}

async function handleResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  let data: unknown;

  if (contentType.includes("application/json")) {
    try {
      data = await response.json();
    } catch {
      data = null;
    }
  } else {
    try {
      data = await response.text();
    } catch {
      data = null;
    }
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`;
    if (data && typeof data === "object") {
      const errorObj = data as Record<string, unknown>;
      if (typeof errorObj.error === "string") {
        message = errorObj.error;
      } else if (typeof errorObj.message === "string") {
        message = errorObj.message;
      }
    } else if (typeof data === "string" && data.length > 0) {
      message = data;
    }
    throw new ApiError(message, response.status, data);
  }

  return data as T;
}

export const apiClient = {
  async get<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    const url = buildUrl(path, params);
    const response = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
    });
    return handleResponse<T>(response);
  },

  async post<T>(path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    const url = buildUrl(path, params);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method: "POST",
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async patch<T>(path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    const url = buildUrl(path, params);
    const headers: Record<string, string> = {
      Accept: "application/json",
    };
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(url, {
      method: "PATCH",
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return handleResponse<T>(response);
  },

  async delete<T>(path: string, params?: Record<string, string | number | boolean | undefined | null>): Promise<T> {
    const url = buildUrl(path, params);
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
    });
    return handleResponse<T>(response);
  },

  async upload<T>(path: string, formData: FormData): Promise<T> {
    const url = buildUrl(path);
    const response = await fetch(url, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
      credentials: "include",
      body: formData,
    });
    return handleResponse<T>(response);
  },
};

export default apiClient;

