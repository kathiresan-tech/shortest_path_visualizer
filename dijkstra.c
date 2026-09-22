#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <limits.h>

#define MAX_NODES 50
#define MAX_INPUT 65536
#define INF 999999999

/* ---- Tiny JSON helpers (no external library needed) ---- */

/* Skip whitespace */
static const char *skip_ws(const char *p) {
    while (*p == ' ' || *p == '\t' || *p == '\n' || *p == '\r') p++;
    return p;
}

/* Parse an integer from JSON */
static const char *parse_int(const char *p, int *out) {
    p = skip_ws(p);
    int neg = 0;
    if (*p == '-') { neg = 1; p++; }
    int val = 0;
    while (*p >= '0' && *p <= '9') {
        val = val * 10 + (*p - '0');
        p++;
    }
    *out = neg ? -val : val;
    return p;
}

/* Find a key in a JSON object (very simple, flat search) */
static const char *find_key(const char *json, const char *key) {
    char pattern[64];
    sprintf(pattern, "\"%s\"", key);
    const char *p = strstr(json, pattern);
    if (!p) return NULL;
    p += strlen(pattern);
    p = skip_ws(p);
    if (*p == ':') p++;
    p = skip_ws(p);
    return p;
}

/* ---- Graph & Dijkstra ---- */

int adj[MAX_NODES][MAX_NODES];   /* adjacency matrix (weights, 0 = no edge) */
int dist[MAX_NODES];
int prev_node[MAX_NODES];
int visited[MAX_NODES];
int visit_order[MAX_NODES];
int visit_count = 0;

void dijkstra(int n, int src) {
    for (int i = 0; i < n; i++) {
        dist[i] = INF;
        prev_node[i] = -1;
        visited[i] = 0;
    }
    dist[src] = 0;
    visit_count = 0;

    for (int iter = 0; iter < n; iter++) {
        /* pick unvisited node with smallest dist */
        int u = -1;
        for (int i = 0; i < n; i++) {
            if (!visited[i] && (u == -1 || dist[i] < dist[u]))
                u = i;
        }
        if (u == -1 || dist[u] == INF) break;

        visited[u] = 1;
        visit_order[visit_count++] = u;

        for (int v = 0; v < n; v++) {
            if (adj[u][v] > 0 && !visited[v]) {
                int new_dist = dist[u] + adj[u][v];
                if (new_dist < dist[v]) {
                    dist[v] = new_dist;
                    prev_node[v] = u;
                }
            }
        }
    }
}

int main(void) {
    /* Read all of stdin */
    char input[MAX_INPUT];
    int total = 0;
    while (total < MAX_INPUT - 1) {
        int ch = fgetc(stdin);
        if (ch == EOF) break;
        input[total++] = (char)ch;
    }
    input[total] = '\0';

    /* Parse fields */
    int nodes = 0;
    const char *p;

    p = find_key(input, "nodes");
    if (p) parse_int(p, &nodes);
    if (nodes <= 0 || nodes > MAX_NODES) {
        printf("{\"error\":\"Invalid number of nodes (max %d)\"}\n", MAX_NODES);
        return 1;
    }

    int source = 0, destination = 0;
    p = find_key(input, "source");
    if (p) parse_int(p, &source);
    p = find_key(input, "destination");
    if (p) parse_int(p, &destination);

    /* Zero adjacency matrix */
    memset(adj, 0, sizeof(adj));

    /* Parse edges array: [ { "from":0, "to":1, "weight":5 }, ... ] */
    p = find_key(input, "edges");
    if (p && *p == '[') {
        p++; /* skip '[' */
        while (*p != ']' && *p != '\0') {
            p = skip_ws(p);
            if (*p == '{') {
                /* find from, to, weight inside this object */
                const char *obj_start = p;
                /* find closing '}' */
                const char *obj_end = strchr(p, '}');
                if (!obj_end) break;

                char obj_buf[512];
                int obj_len = (int)(obj_end - obj_start + 1);
                if (obj_len >= (int)sizeof(obj_buf)) obj_len = sizeof(obj_buf) - 1;
                strncpy(obj_buf, obj_start, obj_len);
                obj_buf[obj_len] = '\0';

                int from = 0, to = 0, weight = 1;
                const char *fp = find_key(obj_buf, "from");
                if (fp) parse_int(fp, &from);
                fp = find_key(obj_buf, "to");
                if (fp) parse_int(fp, &to);
                fp = find_key(obj_buf, "weight");
                if (fp) parse_int(fp, &weight);

                if (from >= 0 && from < nodes && to >= 0 && to < nodes) {
                    adj[from][to] = weight;
                    adj[to][from] = weight;  /* undirected */
                }

                p = obj_end + 1;
            }
            p = skip_ws(p);
            if (*p == ',') p++;
        }
    }

    /* Run Dijkstra */
    dijkstra(nodes, source);

    /* Build path from destination back to source */
    int path[MAX_NODES];
    int path_len = 0;
    if (dist[destination] < INF) {
        int cur = destination;
        while (cur != -1) {
            path[path_len++] = cur;
            cur = prev_node[cur];
        }
        /* Reverse path */
        for (int i = 0; i < path_len / 2; i++) {
            int tmp = path[i];
            path[i] = path[path_len - 1 - i];
            path[path_len - 1 - i] = tmp;
        }
    }

    /* Output JSON */
    printf("{\n");

    /* path */
    printf("  \"path\": [");
    for (int i = 0; i < path_len; i++) {
        if (i > 0) printf(", ");
        printf("%d", path[i]);
    }
    printf("],\n");

    /* distance */
    printf("  \"distance\": %d,\n", dist[destination] < INF ? dist[destination] : -1);

    /* visited_order */
    printf("  \"visited_order\": [");
    for (int i = 0; i < visit_count; i++) {
        if (i > 0) printf(", ");
        printf("%d", visit_order[i]);
    }
    printf("],\n");

    /* distances array */
    printf("  \"distances\": [");
    for (int i = 0; i < nodes; i++) {
        if (i > 0) printf(", ");
        printf("%d", dist[i] < INF ? dist[i] : -1);
    }
    printf("]\n");

    printf("}\n");

    return 0;
}
