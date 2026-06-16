#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import express from "express";
import { z } from "zod";
import dotenv from "dotenv";
import { EvolutionClient } from "./client.js";

// Load environment variables for local testing
dotenv.config();

const apiUrl = process.env.EVOLUTION_API_URL;
const globalKey = process.env.EVOLUTION_GLOBAL_KEY;

if (!apiUrl || !globalKey) {
  console.error(
    "Error: EVOLUTION_API_URL and EVOLUTION_GLOBAL_KEY environment variables are required."
  );
  process.exit(1);
}

// Initialize the Evolution API client
const client = new EvolutionClient(apiUrl, globalKey);

// Helper for error formatting in tool responses
const wrapResult = async (fn: () => Promise<any>) => {
  try {
    const result = await fn();
    return {
      content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
    };
  } catch (error: any) {
    return {
      content: [{ type: "text" as const, text: error.message || "Unknown error occurred" }],
      isError: true,
    };
  }
};

// A McpServer instance can only ever be connect()-ed to one transport. With
// SSE, every browser/client tab that hits GET /sse is a new connection, so
// we must build a fresh server (with its tools re-registered) per connection
// instead of reusing one module-level instance — reusing one throws
// "Already connected to a transport" on the second connection.
function createServer(): McpServer {
  const server = new McpServer({
    name: "whatsapp-evolution-mcp",
    version: "1.0.0",
  });

  // --- 1. INSTANCE MANAGEMENT TOOLS ---

  server.tool(
    "list_instances",
    "List all WhatsApp instances configured on the server and their status.",
    {},
    async () => {
      return wrapResult(() => client.listInstances());
    }
  );

  server.tool(
    "create_instance",
    "Create a new WhatsApp instance on the Evolution server.",
    {
      instanceName: z.string().describe("The unique name for the instance (alphanumeric, no spaces)"),
      token: z.string().optional().describe("Optional custom apikey/token for the instance. If not provided, one will be generated."),
      number: z.string().optional().describe("Optional phone number connected to the instance"),
      qrcode: z.boolean().optional().describe("Whether to return QR Code in the response (default: true)"),
      integration: z.enum(["WHATSAPP-BAILEYS", "WHATSAPP-BUSINESS"]).optional().describe("Integration type (default: WHATSAPP-BAILEYS)"),
    },
    async (args) => {
      return wrapResult(() => client.createInstance(args));
    }
  );

  server.tool(
    "delete_instance",
    "Delete a WhatsApp instance from the server.",
    {
      instanceName: z.string().describe("The name of the instance to delete"),
    },
    async ({ instanceName }) => {
      return wrapResult(() => client.deleteInstance(instanceName));
    }
  );

  server.tool(
    "logout_instance",
    "Logout a WhatsApp instance (disconnects WhatsApp session but keeps the instance definition).",
    {
      instanceName: z.string().describe("The name of the instance to logout"),
    },
    async ({ instanceName }) => {
      return wrapResult(() => client.logoutInstance(instanceName));
    }
  );

  server.tool(
    "connect_instance",
    "Retrieve connection information, status, or QR Code for pairing.",
    {
      instanceName: z.string().describe("The name of the instance to connect"),
    },
    async ({ instanceName }) => {
      return wrapResult(() => client.connectInstance(instanceName));
    }
  );

  server.tool(
    "get_instance_status",
    "Get the current connection status (CONNECTED, DISCONNECTED, etc.) of an instance.",
    {
      instanceName: z.string().describe("The name of the instance to check"),
    },
    async ({ instanceName }) => {
      return wrapResult(() => client.getInstanceStatus(instanceName));
    }
  );

  server.tool(
    "get_messages",
    "Fetch message history for a specific instance (requires Evolution API database to be enabled).",
    {
      instanceName: z.string().describe("The name of the instance"),
      remoteJid: z.string().optional().describe("Optional contact JID to filter messages (e.g. 5511999999999@s.whatsapp.net)"),
      limit: z.number().optional().describe("Number of messages to retrieve"),
    },
    async ({ instanceName, remoteJid, limit }) => {
      const payload: any = {};
      if (remoteJid) payload.where = { remoteJid };
      if (limit) payload.limit = limit;
      return wrapResult(() => client.getMessages(instanceName, payload));
    }
  );

  // --- 2. MESSAGING TOOLS ---

  server.tool(
    "send_text",
    "Send a text message to a WhatsApp contact or group.",
    {
      instanceName: z.string().describe("The instance name to send from"),
      number: z.string().describe("Recipient phone number with country/area code (e.g., 5511999999999) or group JID (e.g. 12036304@g.us)"),
      text: z.string().describe("Message text content"),
      delay: z.number().optional().describe("Delay in milliseconds before sending (e.g. 1000)"),
      presence: z.enum(["composing", "recording", "paused"]).optional().describe("Simulate typing presence status while waiting to send"),
      linkPreview: z.boolean().optional().describe("Whether to enable link previews in the message (default: false)"),
    },
    async ({ instanceName, number, text, delay, presence, linkPreview }) => {
      return wrapResult(() =>
        client.sendText(instanceName, {
          number,
          text,
          options: { delay, presence, linkPreview },
        })
      );
    }
  );

  server.tool(
    "send_media",
    "Send an image, video, audio file, or document via URL or base64.",
    {
      instanceName: z.string().describe("The instance name to send from"),
      number: z.string().describe("Recipient phone number (e.g., 5511999999999) or group JID"),
      mediatype: z.enum(["image", "video", "audio", "document"]).describe("The type of media being sent"),
      media: z.string().describe("Public URL of the media file or Base64 string of the file"),
      caption: z.string().optional().describe("Caption message to accompany the media (applicable for images and videos)"),
      fileName: z.string().optional().describe("Override file name (highly recommended for document type)"),
      delay: z.number().optional().describe("Delay in milliseconds before sending"),
      presence: z.enum(["composing", "recording", "paused"]).optional().describe("Simulate typing/recording presence status"),
    },
    async ({ instanceName, number, mediatype, media, caption, fileName, delay, presence }) => {
      return wrapResult(() =>
        client.sendMedia(instanceName, {
          number,
          mediaMessage: {
            mediatype,
            media,
            caption,
            fileName,
          },
          options: { delay, presence },
        })
      );
    }
  );

  // --- 3. TYPEBOT INTEGRATION TOOLS ---

  server.tool(
    "configure_typebot",
    "Enable and configure Typebot chatbot integration on an instance.",
    {
      instanceName: z.string().describe("The instance name to configure"),
      enabled: z.boolean().describe("Whether to enable (true) or disable (false) Typebot on this instance"),
      url: z.string().describe("Typebot server viewer base URL (e.g., https://app.typebot.io or self-hosted URL)"),
      typebot: z.string().describe("Name/Slug or ID of the Typebot flow to associate"),
      expire: z.number().optional().describe("Session expiration time in seconds (default: 1200 / 20 mins)"),
      keywordFinish: z.string().optional().describe("Keyword message to finish the bot session (e.g., #SAIR or #EXIT)"),
      delayMessage: z.number().optional().describe("Delay in milliseconds between bot messages (default: 1000)"),
      unknownMessage: z.string().optional().describe("Response to send if the bot doesn't recognize input"),
      listeningFromMe: z.boolean().optional().describe("If true, chatbot processes messages sent by the device owner too"),
      stopBotFromMe: z.boolean().optional().describe("If true, sending a manual message from the device device stops the chatbot session"),
      keepOpen: z.boolean().optional().describe("Keep session open after finishing"),
    },
    async ({ instanceName, ...payload }) => {
      return wrapResult(() => client.configureTypebot(instanceName, payload));
    }
  );

  server.tool(
    "get_typebot_settings",
    "Retrieve the Typebot integration settings for an instance.",
    {
      instanceName: z.string().describe("The instance name to query"),
    },
    async ({ instanceName }) => {
      return wrapResult(() => client.getTypebotSettings(instanceName));
    }
  );

  server.tool(
    "change_typebot_status",
    "Change the Typebot session status (open, pause, or close) for a specific contact.",
    {
      instanceName: z.string().describe("The instance name"),
      remoteJid: z.string().describe("The remote contact JID (e.g., 5511999999999@s.whatsapp.net)"),
      status: z.enum(["opened", "paused", "closed"]).describe("The new status for the typebot session"),
    },
    async ({ instanceName, remoteJid, status }) => {
      return wrapResult(() => client.changeTypebotStatus(instanceName, { remoteJid, status }));
    }
  );

  server.tool(
    "start_typebot_flow",
    "Manually trigger a Typebot flow start for a specific WhatsApp contact.",
    {
      instanceName: z.string().describe("The instance name"),
      url: z.string().describe("Typebot server URL"),
      typebot: z.string().describe("Typebot flow name or ID"),
      remoteJid: z.string().describe("The remote contact JID (e.g., 5511999999999@s.whatsapp.net)"),
      startSession: z.boolean().optional().describe("Start a fresh session (default: true)"),
      variables: z.array(
        z.object({
          name: z.string(),
          value: z.string(),
        })
      ).optional().describe("Initial variables to pass to the Typebot flow"),
    },
    async ({ instanceName, ...payload }) => {
      return wrapResult(() => client.startTypebotFlow(instanceName, payload));
    }
  );

  // --- 4. WEBHOOK TOOLS ---

  server.tool(
    "configure_webhook",
    "Configure webhooks to receive real-time events from an instance.",
    {
      instanceName: z.string().describe("The instance name"),
      enabled: z.boolean().describe("Whether to enable (true) or disable (false) webhooks"),
      url: z.string().describe("The destination URL to send POST webhooks to"),
      events: z.array(z.string()).describe("List of events to subscribe to (e.g., ['MESSAGES_UPSERT', 'CONNECTION_UPDATE', 'SEND_MESSAGE'])"),
    },
    async ({ instanceName, ...payload }) => {
      return wrapResult(() => client.configureWebhook(instanceName, payload));
    }
  );

  server.tool(
    "get_webhook_settings",
    "Retrieve the configured webhook settings for a specific instance.",
    {
      instanceName: z.string().describe("The instance name to query"),
    },
    async ({ instanceName }) => {
      return wrapResult(() => client.getWebhookSettings(instanceName));
    }
  );

  return server;
}

// Start the server with Express and SSE transport
async function run() {
  const app = express();
  app.use(express.json());

  // One transport per SSE connection, keyed by the sessionId the SDK embeds
  // in the "endpoint" event it sends on connect (/messages?sessionId=...).
  // A single shared variable here would let a second client's connection
  // silently steal routing for POST /messages away from the first.
  const transports = new Map<string, SSEServerTransport>();

  app.get("/sse", async (req, res) => {
    console.log("New SSE connection established");
    const transport = new SSEServerTransport("/messages", res);
    transports.set(transport.sessionId, transport);

    res.on("close", () => {
      transports.delete(transport.sessionId);
    });

    // Fresh server per connection — see createServer() comment above.
    const server = createServer();
    await server.connect(transport);
  });

  app.post("/messages", async (req, res) => {
    const sessionId = req.query.sessionId as string | undefined;
    const transport = sessionId ? transports.get(sessionId) : undefined;
    if (!transport) {
      res.status(503).send("No active SSE transport for this sessionId — open /sse first");
      return;
    }
    await transport.handlePostMessage(req, res);
  });

  const port = process.env.PORT || 3000;
  app.listen(port, () => {
    console.log(`WhatsApp Evolution API MCP Server running on port ${port} (SSE Transport)`);
    console.log(`SSE URL: http://localhost:${port}/sse`);
  });
}

run().catch((error) => {
  console.error("Fatal error starting server:", error);
  process.exit(1);
});
