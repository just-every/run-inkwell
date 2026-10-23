/** API-001: only shipped public envelope doors; session-only key management is documented in docs/api.md. */
export const apiOpenApi = {
  "openapi": "3.1.0",
  "info": {
    "title": "Inkwell envelope API",
    "version": "0.1.0",
    "description": "Scoped live keys support draft preparation, autonomous policy-authorized creation/sending, reads, artifacts and voiding. API-001 remains partial: OAuth/PKCE, sender self-minting permission, expiry warnings, test mode, webhook management and account audit integration remain unshipped."
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
        "description": "The shipped envelope API, including scopes, autonomous policy gates and rolling rate limits.",
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
        "description": "Drafts require envelopes:prepare and work with API policy off. status=sent requires envelopes:send and an autonomous effective API policy; it creates and releases in one atomic batch (or waits for required internal approval). Off/person/refused policy creates no envelope. commandId retries are scoped to the key for 24 hours; changed input is refused. Every invitation rechecks live policy, principal, credential and frozen definition. Limits: 600 requests/minute, 60 sends/minute per key and 3,000 policy sends/hour per account, rolling windows; 429 supplies Retry-After and queues nothing silently.",
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
    },
    "/api/v1/envelopes/{id}/send": {
      "post": {
        "operationId": "sendEnvelope",
        "security": [
          {
            "ApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "description": "Requires envelopes:send and current edit access. An autonomous API policy authorizes the fixed prepared draft; optional sendAt uses the existing US-zone schedule shape. Policy/credential loss holds a deferred send. A signed-in editor can freshly confirm a held draft under their personal ad hoc/template policy.",
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
          },
          "429": {
            "description": "Rolling key/account quota reached. No silent queue.",
            "headers": {
              "Retry-After": {
                "schema": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": "Seconds until admission may be retried."
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "commandId"
                ],
                "properties": {
                  "commandId": {
                    "type": "string"
                  },
                  "sendAt": {
                    "type": "object",
                    "properties": {
                      "at": {
                        "type": "string"
                      },
                      "timeZone": {
                        "type": "string"
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/v1/envelopes/{id}/void": {
      "post": {
        "operationId": "voidEnvelope",
        "security": [
          {
            "ApiKey": []
          }
        ],
        "parameters": [
          {
            "name": "id",
            "in": "path",
            "required": true,
            "schema": {
              "type": "string"
            }
          }
        ],
        "description": "Requires envelopes:manage and current edit access; a reason is required. Other scopes never imply manage. A voided request cannot be replayed into another void or another send.",
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
          },
          "429": {
            "description": "Rolling key/account quota reached. No silent queue.",
            "headers": {
              "Retry-After": {
                "schema": {
                  "type": "integer",
                  "minimum": 1
                },
                "description": "Seconds until admission may be retried."
              }
            }
          }
        },
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "type": "object",
                "required": [
                  "commandId",
                  "reason"
                ],
                "properties": {
                  "commandId": {
                    "type": "string"
                  },
                  "reason": {
                    "type": "string"
                  }
                }
              }
            }
          }
        }
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
                "envelopes:prepare",
                "envelopes:send",
                "envelopes:manage"
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
            "type": "string",
            "enum": [
              "draft",
              "sent"
            ]
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
