import express from 'express';
import bodyParser from 'body-parser';
import cors from 'cors';

const app = express();
const PORT = 8000;

// Middleware
app.use(cors());
app.use(bodyParser.json());

// Root MCP endpoint - this is what mcp-remote expects
app.post('/mcp', async (req, res) => {
  console.log('Received MCP request:', JSON.stringify(req.body, null, 2));

  const { method, params, id, jsonrpc } = req.body;

  try {
    // Handle notifications (no response needed) - notifications don't have an id
    if (id === undefined && method) {
      console.log(`Handling notification: ${method}`);
      switch (method) {
        case 'notifications/initialized':
          console.log('Client initialized');
          break;
        case 'notifications/cancelled':
          console.log('Request cancelled');
          break;
        default:
          console.log(`Unknown notification: ${method}`);
      }
      // For notifications, we must not send any response
      res.status(204).end(); // 204 No Content
      return;
    }

    // Validate that we have required fields for method calls
    if (!jsonrpc || !method || id === undefined) {
      res.status(400).json({
        jsonrpc: '2.0',
        id: id || null,
        error: {
          code: -32600,
          message: 'Invalid Request - missing required fields',
        },
      });
      return;
    }

    // Handle regular method calls (these have an id)
    switch (method) {
      case 'initialize':
        res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            protocolVersion: '2025-06-18',
            capabilities: {
              tools: {},
            },
            serverInfo: {
              name: 'Remote MCP Server',
              version: '0.1.0',
            },
          },
        });
        break;

      case 'tools/list':
        res.json({
          jsonrpc: '2.0',
          id: id,
          result: {
            tools: [
              {
                name: 'save_conversation',
                description: 'Save this conversation to the cloud for sharing or citing',
                inputSchema: {
                  type: 'object',
                  properties: {
                    content: { type: 'string' },
                    model: {
                      type: 'string',
                      enum: ['chatgpt', 'claude', 'gemini', 'perplexity', 'meta', 'grok', 'deepseek', 'copilot'],
                    },
                  },
                  required: ['content', 'model'],
                },
              },
            ],
          },
        });
        break;

      case 'tools/call':
        if (!params || !params.name) {
          res.status(400).json({
            jsonrpc: '2.0',
            id: id,
            error: {
              code: -32602,
              message: 'Invalid params - missing tool name',
            },
          });
          return;
        }

        const { name, arguments: args } = params;
        let result;

        switch (name) {
          case 'save_conversation':
            if (typeof args.content !== 'string' || typeof args.model !== 'string') {
              res.status(400).json({
                jsonrpc: '2.0',
                id: id,
                error: {
                  code: -32602,
                  message: 'Invalid params - content and model must be strings',
                }
              });
              return;
            }

            const conversationUrl = await save_conversation(args.content, args.model);
            
            result = {
              content: [{ type: 'text', text: `Conversation saved. View it at ${conversationUrl}`}],
            };
            break;

          default:
            res.status(400).json({
              jsonrpc: '2.0',
              id: id,
              error: {
                code: -32601,
                message: `Unknown tool: ${name}`,
              },
            });
            return;
        }

        res.json({
          jsonrpc: '2.0',
          id: id,
          result: result,
        });
        break;

      default:
        res.status(400).json({
          jsonrpc: '2.0',
          id: id,
          error: {
            code: -32601,
            message: `Method not found: ${method}`,
          },
        });
    }
  } catch (error) {
    console.error('Error processing request:', error);
    res.json({
      jsonrpc: '2.0',
      id: id || null,
      error: {
        code: -32603,
        message: error.message,
      },
    });
  }
});

/**
 * 
 * @param {string} content 
 * @param {string} model 
 * @returns {Promise<string>}
 */
async function save_conversation(content, model) {
  // transform input into a Blob
  const blob = new Blob([content], { type: 'text/plain; charset=utf-8' });

  const formData = new FormData();
  formData.append('htmlDoc', blob, 'conversation.html');
  formData.append('model', model);

  if (!process.env.AI_ARCHIVES_BASE_URL) {
    throw new Error('Missing base url, unable to process request');
  }

  const response = await fetch(`${process.env.AI_ARCHIVES_BASE_URL}/api/conversation`, { method: 'POST', body: formData });
  const responseData = await response.json();

  if (!response.ok) {
    throw new Error(`Error message: ${responseData.error}`);
  }

  return responseData.url;
}

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    server: 'Remote MCP Server',
    timestamp: new Date().toISOString(),
  });
});

// Handle GET requests to /mcp (for debugging)
app.get('/mcp', (req, res) => {
  res.json({
    message: 'MCP Server is running',
    note: 'Use POST requests for MCP protocol communication',
  });
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`▶ Remote MCP Server listening on http://0.0.0.0:${PORT}`);
  console.log(`▶ Health check: http://0.0.0.0:${PORT}/health`);
  console.log(`▶ MCP endpoint: http://0.0.0.0:${PORT}/mcp`);
});
