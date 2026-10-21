import { createFileMailbox } from "./fileMailbox";
import { createGraphMailbox } from "./graphMailbox";
import { graphConfigFromEnv, type MailboxProvider } from "./types";

/** Por defecto es el buzón de fichero. Graph solo si MAILBOX_PROVIDER=graph y están las cuatro variables. */
export function createMailboxFromEnv(env: Record<string, string | undefined> = process.env): MailboxProvider {
  const provider = (env.MAILBOX_PROVIDER ?? "file").trim().toLowerCase();
  if (provider !== "graph") return createFileMailbox();
  const config = graphConfigFromEnv(env);
  if (!config) {
    throw new Error("MAILBOX_PROVIDER=graph exige GRAPH_TENANT_ID, GRAPH_CLIENT_ID, GRAPH_CLIENT_SECRET y GRAPH_MAILBOX_USER");
  }
  return createGraphMailbox(config);
}
