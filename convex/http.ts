import { httpRouter } from "convex/server";
import { auth } from "./auth";
import { downloadPrivateFile, uploadPrivateFile } from "./fileHttp";

const http = httpRouter();
auth.addHttpRoutes(http);
// Server-to-server only: called by the LVT file gateway with the user's bearer token.
http.route({ path: "/lvt-files/upload", method: "POST", handler: uploadPrivateFile });
http.route({ path: "/lvt-files/object", method: "GET", handler: downloadPrivateFile });

export default http;
