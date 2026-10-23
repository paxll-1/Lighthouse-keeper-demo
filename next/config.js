globalThis.CloseConfig = {
  "version": 3,
  "carryLimit": {"logs": 1, "boards": 2},
  "shed": {
    "capacity": [{"logs": 4, "boards": 8}, {"logs": 8, "boards": 16}],
    "upgradeBoards": 2,
    "zones": {
      "logs": {"x": 6.1, "z": -4.9},
      "boards": {"x": 6.1, "z": -3.6},
      "upgrade": {"x": 6.1, "z": -2.3}
    }
  },
  "logsPerTree": 1,
  "boardsPerLog": 2,
  "repairBoards": 2,
  "walkSpeed": 2.2,
  "interactionReach": 0.9,
  "workSeconds": {
    "chop": 4.4,
    "collect": 0.75,
    "saw": 4.2,
    "repair": 3.6,
    "light": 1.8,
    "stairs": 4.5,
    "store": 1.1,
    "take": 0.85,
    "upgrade": 4
  },
  "daylightPerMeter": 0.003,
  "daylightPerWork": 0.1,
  "trees": [
    {
      "id": "oak-a",
      "x": -0.5,
      "z": -5.8
    },
    {
      "id": "pine-b",
      "x": 5.5,
      "z": -8
    },
    {
      "id": "pine-c",
      "x": -9,
      "z": 1
    },
    {
      "id": "pine-d",
      "x": -11,
      "z": -0.8
    },
    {
      "id": "pine-e",
      "x": -10.8,
      "z": 3.4
    }
  ],
  "start": {
    "x": -2.8,
    "z": 1.2,
    "heading": 3.14159
  },
  "home": {
    "x": -5,
    "z": -4
  },
  "bench": {
    "x": 3.8,
    "z": -1.6
  },
  "step": {
    "x": -5,
    "z": -1.05
  },
  "lighthouse": {
    "x": 10,
    "z": -7
  },
  "camera": {
    "distance": 12.5,
    "min": 8,
    "max": 38,
    "yaw": -0.46,
    "pitch": 0.56,
    "pitchMin": 0.3,
    "pitchMax": 1.05
  },
  "stairsBoards": 2,
  "shore": [
    {
      "id": "drift-a",
      "x": 8.7,
      "z": 6.8
    },
    {
      "id": "drift-b",
      "x": 5.2,
      "z": 8.6
    }
  ],
  "stairs": {
    "x": 2.8,
    "z": 4.3
  },
  "seat": {
    "x": -11.8,
    "z": -4.6,
    "heading": -1.5707963267948966
  },
  "pier": {
    "x": 5,
    "z": 9.6
  },
  "terrain": {
    "shoreStart": 3.8,
    "shoreEnd": 5.8,
    "shoreDrop": 0.55,
    "ledge": {
      "z": 4.3,
      "xMin": -2.8,
      "xMax": 7.8,
      "gapMin": 1.5,
      "gapMax": 4.1,
      "thickness": 0.28
    }
  }
}
;
