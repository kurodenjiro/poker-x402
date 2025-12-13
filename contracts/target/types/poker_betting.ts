/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/poker_betting.json`.
 */
export type PokerBetting = {
  "address": "85kCu1ahjWTXMmgbpmrXgKNL2DxrrWusYrTYWwA68NMq",
  "metadata": {
    "name": "pokerBetting",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Solana smart contract for poker game betting"
  },
  "instructions": [
    {
      "name": "createLobby",
      "discriminator": [
        116,
        55,
        74,
        48,
        40,
        51,
        135,
        155
      ],
      "accounts": [
        {
          "name": "lobby",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  98,
                  98,
                  121
                ]
              },
              {
                "kind": "arg",
                "path": "gameId"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "lobby"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "gameId",
          "type": "string"
        },
        {
          "name": "modelNames",
          "type": {
            "vec": "string"
          }
        },
        {
          "name": "startingChips",
          "type": "u64"
        },
        {
          "name": "smallBlind",
          "type": "u64"
        },
        {
          "name": "bigBlind",
          "type": "u64"
        },
        {
          "name": "maxHands",
          "type": "u64"
        }
      ]
    },
    {
      "name": "distributeSingleWinning",
      "discriminator": [
        2,
        86,
        68,
        133,
        253,
        85,
        72,
        72
      ],
      "accounts": [
        {
          "name": "lobby",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  98,
                  98,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lobby.game_id",
                "account": "lobby"
              }
            ]
          }
        },
        {
          "name": "bet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lobby"
              },
              {
                "kind": "account",
                "path": "bettor"
              }
            ]
          }
        },
        {
          "name": "owner",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "lobby"
              }
            ]
          }
        },
        {
          "name": "bettor",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "winnerName",
          "type": "string"
        }
      ]
    },
    {
      "name": "placeBet",
      "discriminator": [
        222,
        62,
        67,
        220,
        63,
        166,
        126,
        33
      ],
      "accounts": [
        {
          "name": "lobby",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  98,
                  98,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lobby.game_id",
                "account": "lobby"
              }
            ]
          }
        },
        {
          "name": "bet",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  98,
                  101,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "lobby"
              },
              {
                "kind": "account",
                "path": "bettor"
              }
            ]
          }
        },
        {
          "name": "bettor",
          "writable": true,
          "signer": true
        },
        {
          "name": "escrow",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "lobby"
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "playerName",
          "type": "string"
        },
        {
          "name": "amount",
          "type": "u64"
        }
      ]
    },
    {
      "name": "updateLobbyStatus",
      "discriminator": [
        182,
        152,
        111,
        42,
        14,
        233,
        177,
        201
      ],
      "accounts": [
        {
          "name": "lobby",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  108,
                  111,
                  98,
                  98,
                  121
                ]
              },
              {
                "kind": "account",
                "path": "lobby.game_id",
                "account": "lobby"
              }
            ]
          }
        },
        {
          "name": "owner",
          "signer": true
        }
      ],
      "args": [
        {
          "name": "status",
          "type": {
            "defined": {
              "name": "lobbyStatus"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "bet",
      "discriminator": [
        147,
        23,
        35,
        59,
        15,
        75,
        155,
        32
      ]
    },
    {
      "name": "lobby",
      "discriminator": [
        167,
        194,
        217,
        163,
        92,
        92,
        103,
        49
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "lobbyNotOpenForBets",
      "msg": "Lobby is not open for bets."
    },
    {
      "code": 6001,
      "name": "invalidPlayerName",
      "msg": "Invalid player name."
    },
    {
      "code": 6002,
      "name": "betAmountMustBePositive",
      "msg": "Bet amount must be positive."
    },
    {
      "code": 6003,
      "name": "unauthorized",
      "msg": "Unauthorized to perform this action."
    },
    {
      "code": 6004,
      "name": "lobbyNotFinished",
      "msg": "Lobby has not finished yet."
    },
    {
      "code": 6005,
      "name": "invalidBetAccount",
      "msg": "Invalid bet account for this lobby."
    },
    {
      "code": 6006,
      "name": "invalidBettor",
      "msg": "Bettor does not match the bet account."
    },
    {
      "code": 6007,
      "name": "betOnWrongPlayer",
      "msg": "Bet was placed on a different player."
    },
    {
      "code": 6008,
      "name": "betAlreadyProcessed",
      "msg": "Bet has already been processed (paid or refunded)."
    },
    {
      "code": 6009,
      "name": "overflow",
      "msg": "Arithmetic overflow."
    }
  ],
  "types": [
    {
      "name": "bet",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "bettor",
            "type": "pubkey"
          },
          {
            "name": "lobby",
            "type": "pubkey"
          },
          {
            "name": "playerName",
            "type": "string"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "placedAt",
            "type": "i64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "betStatus"
              }
            }
          }
        ]
      }
    },
    {
      "name": "betStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "active"
          },
          {
            "name": "paid"
          },
          {
            "name": "refunded"
          }
        ]
      }
    },
    {
      "name": "lobby",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "gameId",
            "type": "string"
          },
          {
            "name": "modelNames",
            "type": {
              "vec": "string"
            }
          },
          {
            "name": "startingChips",
            "type": "u64"
          },
          {
            "name": "smallBlind",
            "type": "u64"
          },
          {
            "name": "bigBlind",
            "type": "u64"
          },
          {
            "name": "maxHands",
            "type": "u64"
          },
          {
            "name": "status",
            "type": {
              "defined": {
                "name": "lobbyStatus"
              }
            }
          },
          {
            "name": "totalBets",
            "type": "u64"
          },
          {
            "name": "createdAt",
            "type": "i64"
          },
          {
            "name": "updatedAt",
            "type": "i64"
          }
        ]
      }
    },
    {
      "name": "lobbyStatus",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "waiting"
          },
          {
            "name": "running"
          },
          {
            "name": "finished"
          }
        ]
      }
    }
  ]
};
