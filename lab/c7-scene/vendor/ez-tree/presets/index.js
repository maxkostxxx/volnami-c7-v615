/* Selected upstream presets; JSON embedded for native browser ESM. */
const presets = {
  "Aspen Medium": {
    "seed": 18020,
    "type": "deciduous",
    "bark": {
      "type": "Bark002",
      "tint": 16777215,
      "flatShading": false,
      "textured": true,
      "textureScale": {
        "x": 1,
        "y": 1
      }
    },
    "branch": {
      "levels": 2,
      "angle": {
        "1": 75,
        "2": 32,
        "3": 7
      },
      "children": {
        "0": 10,
        "1": 3,
        "2": 3
      },
      "force": {
        "direction": {
          "x": 0,
          "y": 1,
          "z": 0
        },
        "strength": 0.0148
      },
      "gnarliness": {
        "0": 0.05,
        "1": 0.12,
        "2": 0.12,
        "3": 0.02
      },
      "length": {
        "0": 50,
        "1": 6.07,
        "2": 11.19,
        "3": 1
      },
      "radius": {
        "0": 0.72,
        "1": 0.41,
        "2": 0.7,
        "3": 0.7
      },
      "sections": {
        "0": 12,
        "1": 10,
        "2": 8,
        "3": 6
      },
      "segments": {
        "0": 8,
        "1": 6,
        "2": 4,
        "3": 3
      },
      "start": {
        "1": 0.59,
        "2": 0.35,
        "3": 0
      },
      "taper": {
        "0": 0.37,
        "1": 0.13,
        "2": 0.7,
        "3": 0.7
      },
      "twist": {
        "0": 0,
        "1": 0,
        "2": 0,
        "3": 0
      }
    },
    "leaves": {
      "type": "aspen",
      "billboard": "double",
      "angle": 30,
      "count": 11,
      "start": 0.124,
      "size": 2.5,
      "sizeVariance": 0.7,
      "tint": 16775778,
      "alphaTest": 0.5
    },
    "trellis": {
      "enabled": false
    }
  },
  "Oak Medium": {
    "seed": 35729,
    "type": "deciduous",
    "bark": {
      "type": "Bark001",
      "tint": 16774097,
      "flatShading": false,
      "textured": true,
      "textureScale": {
        "x": 1,
        "y": 10
      }
    },
    "branch": {
      "levels": 3,
      "angle": {
        "1": 54,
        "2": 58,
        "3": 32
      },
      "children": {
        "0": 6,
        "1": 4,
        "2": 3
      },
      "force": {
        "direction": {
          "x": 0,
          "y": 1,
          "z": 0
        },
        "strength": 0.02
      },
      "gnarliness": {
        "0": 0,
        "1": -0.1,
        "2": -0.15,
        "3": 0.09
      },
      "length": {
        "0": 37.24,
        "1": 11.08,
        "2": 12.39,
        "3": 7.16
      },
      "radius": {
        "0": 1.41,
        "1": 0.9,
        "2": 0.69,
        "3": 1.19
      },
      "sections": {
        "0": 8,
        "1": 6,
        "2": 3,
        "3": 1
      },
      "segments": {
        "0": 7,
        "1": 5,
        "2": 3,
        "3": 3
      },
      "start": {
        "1": 0.49,
        "2": 0.06,
        "3": 0.12
      },
      "taper": {
        "0": 0.73,
        "1": 0.42,
        "2": 0.69,
        "3": 0.75
      },
      "twist": {
        "0": -0.23,
        "1": 0.42,
        "2": 0,
        "3": 0
      }
    },
    "leaves": {
      "type": "oak",
      "billboard": "double",
      "angle": 42,
      "count": 18,
      "start": 0.16,
      "size": 2.5,
      "sizeVariance": 0.7,
      "tint": 14013901,
      "alphaTest": 0.5
    },
    "trellis": {
      "enabled": false
    }
  },
  "Ash Medium": {
    "seed": 36330,
    "type": "deciduous",
    "bark": {
      "type": "Bark001",
      "tint": 13552830,
      "flatShading": false,
      "textured": true,
      "textureScale": {
        "x": 0.5,
        "y": 5.0
      }
    },
    "branch": {
      "levels": 3,
      "angle": {
        "1": 48,
        "2": 75,
        "3": 60
      },
      "children": {
        "0": 7,
        "1": 4,
        "2": 3
      },
      "force": {
        "direction": {
          "x": 0,
          "y": 1,
          "z": 0
        },
        "strength": 0.01
      },
      "gnarliness": {
        "0": 0.03,
        "1": 0.25,
        "2": 0.2,
        "3": 0.09
      },
      "length": {
        "0": 43.47,
        "1": 27.14,
        "2": 9.51,
        "3": 4.6
      },
      "radius": {
        "0": 2,
        "1": 0.63,
        "2": 0.76,
        "3": 0.7
      },
      "sections": {
        "0": 12,
        "1": 8,
        "2": 6,
        "3": 4
      },
      "segments": {
        "0": 12,
        "1": 6,
        "2": 4,
        "3": 3
      },
      "start": {
        "1": 0.23,
        "2": 0.33,
        "3": 0
      },
      "taper": {
        "0": 0.7,
        "1": 0.7,
        "2": 0.7,
        "3": 0.7
      },
      "twist": {
        "0": 0.09,
        "1": -0.07,
        "2": 0,
        "3": 0
      }
    },
    "leaves": {
      "type": "ash",
      "billboard": "double",
      "angle": 55,
      "count": 16,
      "start": 0,
      "size": 2.67,
      "sizeVariance": 0.72,
      "tint": 16777215,
      "alphaTest": 0.5
    },
    "trellis": {
      "enabled": false
    }
  }
};
export function loadPreset(name) { if (!presets[name]) throw new Error('Unavailable tree preset: '+name); return structuredClone(presets[name]); }
