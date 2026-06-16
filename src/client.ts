import axios, { AxiosInstance } from "axios";

export interface CreateInstancePayload {
  instanceName: string;
  token?: string;
  number?: string;
  qrcode?: boolean;
  integration?: "WHATSAPP-BAILEYS" | "WHATSAPP-BUSINESS";
}

export interface SendTextPayload {
  number: string;
  text: string;
  options?: {
    delay?: number;
    presence?: "composing" | "recording" | "paused";
    linkPreview?: boolean;
  };
}

export interface SendMediaPayload {
  number: string;
  mediaMessage: {
    mediatype: "image" | "video" | "audio" | "document";
    media: string; // URL or Base64 string
    caption?: string;
    fileName?: string;
  };
  options?: {
    delay?: number;
    presence?: "composing" | "recording" | "paused";
  };
}

export interface ConfigureTypebotPayload {
  enabled: boolean;
  url: string;
  typebot: string;
  expire?: number;
  keywordFinish?: string;
  delayMessage?: number;
  unknownMessage?: string;
  listeningFromMe?: boolean;
  stopBotFromMe?: boolean;
  keepOpen?: boolean;
}

export interface TypebotChangeStatusPayload {
  remoteJid: string;
  status: "opened" | "paused" | "closed";
}

export interface TypebotStartPayload {
  url: string;
  typebot: string;
  remoteJid: string;
  startSession?: boolean;
  variables?: Array<{ name: string; value: string }>;
}

export interface ConfigureWebhookPayload {
  enabled: boolean;
  url: string;
  events: string[];
}

export interface FetchMessagesPayload {
  where?: any;
  limit?: number;
  offset?: number;
}

export class EvolutionClient {
  private axiosInstance: AxiosInstance;

  constructor(apiUrl: string, globalKey: string) {
    // Ensure API URL has no trailing slash
    const baseURL = apiUrl.replace(/\/+$/, "");
    this.axiosInstance = axios.create({
      baseURL,
      headers: {
        "Content-Type": "application/json",
        "apikey": globalKey,
      },
    });
  }

  // --- INSTANCE MANAGEMENT ---

  async listInstances() {
    try {
      const response = await this.axiosInstance.get("/instance/fetchInstances");
      return response.data;
    } catch (error: any) {
      this.handleError("listInstances", error);
    }
  }

  async createInstance(payload: CreateInstancePayload) {
    try {
      const response = await this.axiosInstance.post("/instance/create", payload);
      return response.data;
    } catch (error: any) {
      this.handleError("createInstance", error);
    }
  }

  async deleteInstance(instanceName: string) {
    try {
      const response = await this.axiosInstance.delete(`/instance/delete/${instanceName}`);
      return response.data;
    } catch (error: any) {
      this.handleError("deleteInstance", error);
    }
  }

  async logoutInstance(instanceName: string) {
    try {
      const response = await this.axiosInstance.post(`/instance/logout/${instanceName}`);
      return response.data;
    } catch (error: any) {
      this.handleError("logoutInstance", error);
    }
  }

  async connectInstance(instanceName: string) {
    try {
      const response = await this.axiosInstance.get(`/instance/connect/${instanceName}`);
      return response.data;
    } catch (error: any) {
      this.handleError("connectInstance", error);
    }
  }

  async getInstanceStatus(instanceName: string) {
    try {
      const response = await this.axiosInstance.get(`/instance/connectionStatus/${instanceName}`);
      return response.data;
    } catch (error: any) {
      this.handleError("getInstanceStatus", error);
    }
  }

  // --- MESSAGING ---

  async sendText(instanceName: string, payload: SendTextPayload) {
    try {
      const response = await this.axiosInstance.post(`/message/sendText/${instanceName}`, payload);
      return response.data;
    } catch (error: any) {
      this.handleError("sendText", error);
    }
  }

  async sendMedia(instanceName: string, payload: SendMediaPayload) {
    try {
      const response = await this.axiosInstance.post(`/message/sendMedia/${instanceName}`, payload);
      return response.data;
    } catch (error: any) {
      this.handleError("sendMedia", error);
    }
  }

  async getMessages(instanceName: string, payload: FetchMessagesPayload = {}) {
    try {
      // In Evolution API v2, fetching messages is typically a POST to /chat/findMessages/:instance
      const response = await this.axiosInstance.post(`/chat/findMessages/${instanceName}`, payload);
      return response.data;
    } catch (error: any) {
      this.handleError("getMessages", error);
    }
  }

  // --- TYPEBOT INTEGRATION ---

  async configureTypebot(instanceName: string, payload: ConfigureTypebotPayload) {
    try {
      // In Evolution API v2, configuring typebot is POST to /typebot/create/:instance
      const response = await this.axiosInstance.post(`/typebot/create/${instanceName}`, payload);
      return response.data;
    } catch (error: any) {
      this.handleError("configureTypebot", error);
    }
  }

  async getTypebotSettings(instanceName: string) {
    try {
      const response = await this.axiosInstance.get(`/typebot/fetchSettings/${instanceName}`);
      return response.data;
    } catch (error: any) {
      this.handleError("getTypebotSettings", error);
    }
  }

  async changeTypebotStatus(instanceName: string, payload: TypebotChangeStatusPayload) {
    try {
      const response = await this.axiosInstance.post(`/typebot/changeStatus/${instanceName}`, payload);
      return response.data;
    } catch (error: any) {
      this.handleError("changeTypebotStatus", error);
    }
  }

  async startTypebotFlow(instanceName: string, payload: TypebotStartPayload) {
    try {
      const response = await this.axiosInstance.post(`/typebot/start/${instanceName}`, payload);
      return response.data;
    } catch (error: any) {
      this.handleError("startTypebotFlow", error);
    }
  }

  // --- WEBHOOKS ---

  async configureWebhook(instanceName: string, payload: ConfigureWebhookPayload) {
    try {
      const response = await this.axiosInstance.post(`/webhook/set/${instanceName}`, payload);
      return response.data;
    } catch (error: any) {
      this.handleError("configureWebhook", error);
    }
  }

  async getWebhookSettings(instanceName: string) {
    try {
      const response = await this.axiosInstance.get(`/webhook/find/${instanceName}`);
      return response.data;
    } catch (error: any) {
      this.handleError("getWebhookSettings", error);
    }
  }

  // --- ERROR HANDLING ---

  private handleError(action: string, error: any) {
    const status = error.response?.status;
    const details = error.response?.data;
    const message = error.message;

    console.error(`Error in EvolutionClient.${action}:`, {
      status,
      details,
      message,
    });

    let errMsg = `Evolution API error during ${action}: ${message}`;
    if (details) {
      errMsg += ` - Details: ${JSON.stringify(details)}`;
    }
    throw new Error(errMsg);
  }
}
