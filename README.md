# WhatsApp Evolution API MCP Server

Um servidor de **Model Context Protocol (MCP)** para integrar a **Evolution API (v2)** diretamente com assistentes de IA (como Claude Desktop, Cursor e outros). Ele expõe ferramentas para gerenciamento de instâncias, envio de mensagens, configuração de chatbots (Typebot) e webhooks.

---

## 🚀 Como Começar

### 1. Pré-requisitos
*   Node.js (versão 18 ou superior)
*   Instância ativa da **Evolution API v2**

### 2. Instalação e Compilação
No diretório deste projeto (`whatsapp_manager`), execute os seguintes comandos no terminal:

```bash
# Instalar dependências
npm install

# Compilar o código TypeScript
npm run build
```

---

## ⚙️ Configuração das Variáveis de Ambiente

O servidor MCP precisa saber o endereço da sua Evolution API e a chave global (Admin Key) para se autenticar. 

1. Crie um arquivo `.env` na raiz do projeto (copiando do `.env.example`):
   ```env
   EVOLUTION_API_URL=https://api.seudominio.com
   EVOLUTION_GLOBAL_KEY=sua-chave-global-da-evolution-api
   ```

*(Nota: Você também pode passar essas variáveis diretamente no arquivo de configuração do Claude Desktop ou Cursor, como detalhado abaixo).*

---

## 🤖 Integração com Clientes de IA

### 1. Claude Desktop

Para integrar com o **Claude Desktop**, você deve editar o arquivo de configurações global dele. No Windows, ele geralmente fica em:
`%APPDATA%\Claude\claude_desktop_config.json` (geralmente `C:\Users\SEU_USUARIO\AppData\Roaming\Claude\claude_desktop_config.json`).

Abra o arquivo e adicione o servidor sob a propriedade `mcpServers`:

```json
{
  "mcpServers": {
    "whatsapp-evolution": {
      "command": "node",
      "args": [
        "d:/Códigos/Tzolkin/.tzolkin/.tools/whatsapp_manager/build/index.js"
      ],
      "env": {
        "EVOLUTION_API_URL": "https://api.seudominio.com",
        "EVOLUTION_GLOBAL_KEY": "sua-chave-global-da-evolution-api"
      }
    }
  }
}
```

*Certifique-se de usar caminhos absolutos e barras normais `/` (como mostrado acima).*

---

### 2. Cursor / Antigravity

Para registrar este servidor MCP no **Cursor**:

1. Vá em **Cursor Settings** (ícone de engrenagem no canto superior direito) -> **Features** -> **MCP**.
2. Clique em **+ Add New MCP Server**.
3. Preencha as configurações:
   *   **Name**: `whatsapp-evolution`
   *   **Type**: `command`
   *   **Command**:
       ```bash
       node "d:/Códigos/Tzolkin/.tzolkin/.tools/whatsapp_manager/build/index.js"
       ```
4. Adicione as variáveis de ambiente necessárias (`EVOLUTION_API_URL` e `EVOLUTION_GLOBAL_KEY`) no menu correspondente do Cursor ou certifique-se de que elas estão carregadas no seu sistema / arquivo `.env`.

---

## 🛠️ Ferramentas Disponíveis

Este servidor exporta as seguintes ferramentas (tools) para o seu modelo de IA usar:

| Categoria | Nome da Ferramenta | Descrição |
| :--- | :--- | :--- |
| **Instância** | `list_instances` | Lista todas as instâncias configuradas e seus status de conexão. |
| **Instância** | `create_instance` | Cria uma nova instância de WhatsApp. |
| **Instância** | `connect_instance` | Obtém o QR Code ou dados de emparelhamento de uma instância específica. |
| **Instância** | `get_instance_status` | Verifica o status da conexão (CONNECTED, DISCONNECTED, etc.). |
| **Instância** | `logout_instance` | Desconecta a sessão ativa do WhatsApp. |
| **Instância** | `delete_instance` | Exclui definitivamente uma instância do servidor. |
| **Mensagens** | `send_text` | Envia mensagens de texto para contatos ou grupos. |
| **Mensagens** | `send_media` | Envia imagens, vídeos, áudios ou documentos (por URL ou Base64). |
| **Typebot** | `configure_typebot` | Configura e ativa a integração do Typebot em uma instância. |
| **Typebot** | `get_typebot_settings` | Exibe as configurações atuais do Typebot na instância. |
| **Typebot** | `change_typebot_status` | Abre, pausa ou fecha a sessão de atendimento do Typebot para um contato. |
| **Typebot** | `start_typebot_flow` | Inicia manualmente um fluxo do Typebot para um contato específico. |
| **Webhook** | `configure_webhook` | Configura os webhooks para receber notificações e mensagens recebidas. |
| **Webhook** | `get_webhook_settings` | Consulta os webhooks atualmente configurados na instância. |
