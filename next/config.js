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
    "coastExtension": {
      "bounds": {"xMin": -16, "xMax": 24, "zMin": -12, "zMax": 12},
      "saveXMax": 24,
      "outline": [[13.55,-2.3],[15.8,-3.05],[18,-2.75],[19.5,-1.75],[21.85,-1.35],[23.1,0.05],[23.35,1.9],[22.6,2.2],[21.85,1.3],[20.5,1.15],[20.35,2.15],[21.75,2.75],[22.3,4.05],[21.65,6.2],[19.7,7.0],[18.15,5.6],[17.2,3.8],[16.9,1.6],[15.8,0.65],[14.2,0.85]],
      "rocks": [
        {"x":16.35,"z":-2.35,"rx":0.68,"rz":0.38,"height":1.1},
        {"x":16.45,"z":0.15,"rx":0.64,"rz":0.48,"height":0.82},
        {"x":18.65,"z":-2.0,"rx":0.65,"rz":0.34,"height":0.72},
        {"x":19.65,"z":0.55,"rx":0.48,"rz":0.3,"height":0.62},
        {"x":18.05,"z":4.45,"rx":0.38,"rz":0.59,"height":0.67},
        {"x":21.95,"z":5.1,"rx":0.35,"rz":0.36,"height":0.62},
        {"x":22.0,"z":3.4,"rx":0.29,"rz":0.42,"height":0.48},
        {"x":20.25,"z":6.75,"rx":0.66,"rz":0.17,"height":0.33}
      ],
      "trail": [[13.9,-1.0],[15.1,-1.1],[16.45,-1.1],[17.8,-0.9],[18.4,0.35],[18.45,1.4],[18.8,2.65],[19.25,4.1],[19.4,5.3]],
      "pool": {"x":20.25,"z":6.1,"rx":0.95,"rz":0.29}
    },
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
