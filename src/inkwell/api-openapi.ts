/** API-001: only shipped public read/draft doors; session-only key management is documented in docs/api.md. */
export const apiOpenApi = {
  "openapi": "3.1.0",
  "info": {
    "title": "Inkwell read and draft API",
    "version": "0.1.0",
    "description": "API-001 is partial: live scoped keys, reads and draft preparation. No autonomous sending, OAuth, quotas, expiry warning mail, test mode or account-audit integration yet. API keys cannot use member-session commands or preparation-agent routes."
  },
  "servers": [
    {
      "url": "/"
    }
  ],
  "paths": {
    "/api/v1/openapi.json": {
      "get": {
        "operationId": "describeApi",
        "description": "The shipped read and draft API. Sending, test mode, OAuth, quotas and expiry warnings are not implemented.",
        "security": [],
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error400"
          },
          "401": {
            "$ref": "#/components/responses/Error401"
          },
          "403": {
            "$ref": "#/components/responses/Error403"
          },
          "404": {
            "$ref": "#/components/responses/Error404"
          },
          "409": {
            "$ref": "#/components/responses/Error409"
          }
        }
      }
    },
    "/api/v1/envelopes": {
      "get": {
        "operationId": "listEnvelopes",
        "description": "Requires envelopes:read. Results are limited by the bound member’s live record access. Uses the same query filters as the workspace dashboard.",
        "security": [
          {
            "ApiKey": []
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "envelopes": {
                      "type": "array",
                      "items": {
                        "$ref": "#/components/schemas/Envelope"
                      }
                    },
                    "total": {
                      "type": "integer"
                    },
                    "next": {
                      "type": [
                        "string",
                        "null"
                      ]
                    },
                    "counts": {
                      "type": "object"
                    }
                  },
                  "required": []
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error400"
          },
          "401": {
            "$ref": "#/components/responses/Error401"
          },
          "403": {
            "$ref": "#/components/responses/Error403"
          },
          "404": {
            "$ref": "#/components/responses/Error404"
          },
          "409": {
            "$ref": "#/components/responses/Error409"
          }
        },
        "parameters": [
          {
            "name": "q",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "status",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "sender",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "from",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "to",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "template",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "cursor",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "limit",
            "in": "query",
            "schema": {
              "type": "integer",
              "minimum": 1,
              "maximum": 100
            }
          }
        ]
      },
      "post": {
        "operationId": "prepareEnvelope",
        "description": "Requires envelopes:prepare. Creates an unsigned draft even when API send policy is off. No signer invitation is sent. commandId retries are scoped to this key; changed input with the same ID is refused. status=sent is refused with 403 and creates nothing.",
        "security": [
          {
            "ApiKey": []
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "result": {
                      "type": "object",
                      "properties": {
                        "id": {
                          "type": "string"
                        }
                      },
                      "required": [
                        "id"
                      ]
                    }
                  },
                  "required": []
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error400"
          },
          "401": {
            "$ref": "#/components/responses/Error401"
          },
          "403": {
            "$ref": "#/components/responses/Error403"
          },
          "404": {
            "$ref": "#/components/responses/Error404"
          },
          "409": {
            "$ref": "#/components/responses/Error409"
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/Preparation"
              }
            }
          }
        }
      }
    },
    "/api/v1/envelopes/{id}": {
      "get": {
        "operationId": "readEnvelope",
        "description": "Requires envelopes:read and the bound member’s current record access.",
        "security": [
          {
            "ApiKey": []
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "envelope": {
                      "$ref": "#/components/schemas/Envelope"
                    }
                  },
                  "required": []
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error400"
          },
          "401": {
            "$ref": "#/components/responses/Error401"
          },
          "403": {
            "$ref": "#/components/responses/Error403"
          },
          "404": {
            "$ref": "#/components/responses/Error404"
          },
          "409": {
            "$ref": "#/components/responses/Error409"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    },
    "/api/v1/envelopes/{id}/artifacts/{kind}": {
      "get": {
        "operationId": "downloadArtifact",
        "description": "Requires artifacts:read and the bound member’s current record access. Does not require envelopes:read.",
        "security": [
          {
            "ApiKey": []
          }
        ],
        "responses": {
          "200": {
            "description": "The requested existing artifact; unavailable artifacts return 404.",
            "content": {
              "application/pdf": {
                "schema": {
                  "type": "string",
                  "format": "binary"
                }
              },
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error400"
          },
          "401": {
            "$ref": "#/components/responses/Error401"
          },
          "403": {
            "$ref": "#/components/responses/Error403"
          },
          "404": {
            "$ref": "#/components/responses/Error404"
          },
          "409": {
            "$ref": "#/components/responses/Error409"
          }
        },
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "kind",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string",
              "description": "original, signed, certificate, audit, handoff, paper-<recipient-index>, or supplement-<supplement-id>"
            }
          }
        ]
      }
    },
    "/api/v1/templates": {
      "get": {
        "operationId": "listTemplates",
        "description": "Requires templates:read. Lists only templates available to the bound member.",
        "security": [
          {
            "ApiKey": []
          }
        ],
        "responses": {
          "200": {
            "description": "Successful response",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object"
                }
              }
            }
          },
          "400": {
            "$ref": "#/components/responses/Error400"
          },
          "401": {
            "$ref": "#/components/responses/Error401"
          },
          "403": {
            "$ref": "#/components/responses/Error403"
          },
          "404": {
            "$ref": "#/components/responses/Error404"
          },
          "409": {
            "$ref": "#/components/responses/Error409"
          }
        },
        "parameters": [
          {
            "name": "q",
            "in": "query",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "folder",
            "in": "query",
            "schema": {
              "type": "string"
            }
          }
        ]
      }
    }
  },
  "components": {
    "securitySchemes": {
      "ApiKey": {
        "type": "http",
        "scheme": "bearer",
        "bearerFormat": "iwk_live_<key-id>_<256-bit-secret>"
      }
    },
    "schemas": {
      "Error": {
        "type": "object",
        "properties": {
          "error": {
            "type": "string"
          },
          "code": {
            "type": "string"
          }
        },
        "required": [
          "error"
        ]
      },
      "Key": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "name": {
            "type": "string"
          },
          "memberId": {
            "type": "string"
          },
          "prefix": {
            "type": "string"
          },
          "lastFour": {
            "type": "string"
          },
          "createdBy": {
            "type": "string"
          },
          "memberVersion": {
            "type": "integer"
          },
          "memberRole": {
            "type": "string",
            "enum": [
              "owner",
              "admin",
              "sender"
            ]
          },
          "scopes": {
            "type": "array",
            "items": {
              "type": "string",
              "enum": [
                "envelopes:read",
                "artifacts:read",
                "templates:read",
                "envelopes:prepare"
              ]
            }
          },
          "createdAt": {
            "type": "string",
            "format": "date-time"
          },
          "expiresAt": {
            "type": "string",
            "format": "date-time"
          },
          "revokedAt": {
            "type": [
              "string",
              "null"
            ]
          },
          "suspendedAt": {
            "type": [
              "string",
              "null"
            ]
          },
          "rotatedTo": {
            "type": [
              "string",
              "null"
            ]
          },
          "version": {
            "type": "integer"
          }
        },
        "required": []
      },
      "Envelope": {
        "type": "object",
        "description": "The current envelope record, including fingerprints, recipients, fields and audit events."
      },
      "Preparation": {
        "type": "object",
        "properties": {
          "commandId": {
            "type": "string"
          },
          "status": {
            "const": "draft"
          },
          "title": {
            "type": "string"
          },
          "filename": {
            "type": "string",
            "description": "PDF filename"
          },
          "pdfBase64": {
            "type": "string",
            "description": "Base64 original PDF, at most 2 MiB decoded"
          },
          "signers": {
            "type": "array",
            "minItems": 1,
            "maxItems": 5,
            "items": {
              "type": "object",
              "properties": {
                "name": {
                  "type": "string"
                },
                "email": {
                  "type": "string",
                  "format": "email"
                },
                "order": {
                  "type": "integer",
                  "minimum": 1,
                  "maximum": 100
                }
              },
              "required": [
                "name",
                "email"
              ]
            }
          },
          "fields": {
            "type": "array",
            "items": {
              "$ref": "#/components/schemas/Field"
            }
          },
          "freeForm": {
            "type": "boolean"
          },
          "expiryDays": {
            "type": "integer",
            "minimum": 1,
            "maximum": 365
          }
        },
        "required": [
          "commandId",
          "title",
          "filename",
          "pdfBase64",
          "signers",
          "fields"
        ]
      },
      "Field": {
        "type": "object",
        "properties": {
          "id": {
            "type": "string"
          },
          "label": {
            "type": "string"
          },
          "type": {
            "type": "string",
            "enum": [
              "signature",
              "initials",
              "date_signed",
              "full_name",
              "email",
              "company",
              "title",
              "text",
              "date",
              "checkbox",
              "number",
              "radio",
              "dropdown",
              "checkbox_group",
              "note",
              "stamp"
            ]
          },
          "signer": {
            "type": "integer",
            "minimum": 0
          },
          "page": {
            "type": "integer",
            "minimum": 0
          },
          "x": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "y": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "width": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          },
          "height": {
            "type": "number",
            "minimum": 0,
            "maximum": 1
          }
        },
        "required": [
          "id",
          "label",
          "type",
          "signer",
          "page",
          "x",
          "y",
          "width",
          "height"
        ]
      }
    },
    "responses": {
      "Error400": {
        "description": "Invalid input or unavailable scope",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "Error401": {
        "description": "Missing, expired, revoked or suspended credential",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "Error403": {
        "description": "Scope, member access or fresh-session requirement refused",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "Error404": {
        "description": "Record not found",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      },
      "Error409": {
        "description": "Stale command, changed record or unavailable feature",
        "content": {
          "application/json": {
            "schema": {
              "$ref": "#/components/schemas/Error"
            }
          }
        }
      }
    }
  }
} as const
