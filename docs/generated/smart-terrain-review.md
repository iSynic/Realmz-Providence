# Smart Terrain First Review Batch

Generated: 2026-07-10T21:44:16.125Z

Review each proposed tile role against the centered tile in the representative 5x5 contexts. Record accepted roles, exclusions, or terrain-family corrections in curated source metadata; this file is generated.

Decision vocabulary: `center`, cardinal edge, corner, line, cap, `single`, `detail`, `exclude`, or `needs-atlas-review`.

## 1. Landlook 4 Forest Tile 123

- Priority: critical
- Evidence: 485 placement(s)
- Suggested role: single (70%)
- Human-approved role(s): none
- Legacy fallback role(s): southEast, notchSouthEast
- Review reasons: curated-role-disagreement
- Decision: pending

### Araman's Ring, land 1, cell 18,9

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  38    25    98   111   111 
  38    25   111   111   111 
  38    25  [123]  111   120 
  35    37    39    39    39 
  40    40    40    40    40 
```

### Assault on Giant Mountain, land 4, cell 11,10

Observed as capEast, mask 2. Center tile is wrapped in brackets.

```text
 111    77   111   111    77 
 111    18    61    61    17 
 111     2  [123]  123    77 
   1    19    61    61    17 
 111    60   -97   111    77 
```

### Assault on Giant Mountain, land 5, cell 52,7

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 164   111   112    48    28 
 111   163   111    38    42 
 152   164  [123]   38    25 
   1    61     1    32    33 
 141   142   143    38    42 
```

## 2. Landlook 4 Mountains Tile 83

- Priority: critical
- Evidence: 337 placement(s)
- Suggested role: southEast (66%)
- Human-approved role(s): none
- Legacy fallback role(s): north, lineHorizontal
- Review reasons: curated-role-disagreement
- Decision: pending

### Araman's Ring, land 1, cell 67,50

Observed as southEast, mask 201. Center tile is wrapped in brackets.

```text
  78    78    89    48    35 
  78    78    89    38    40 
  78    80  [ 83]   38    40 
  87    83   152    38    40 
 143    30    39    35    40 
```

### Assault on Giant Mountain, land 5, cell 79,19

Observed as southEast, mask 9. Center tile is wrapped in brackets.

```text
  88    95    89    38    40 
  88    95    89    38    40 
  85    87  [ 83]   38    40 
 111   111   111    38    40 
 152   152   173    38    40 
```

### Assault on Giant Mountain, land 6, cell 41,15

Observed as northWest, mask 118. Center tile is wrapped in brackets.

```text
  40    40    33    76    32 
  40    36    29    87    31 
  36    29  [ 83]   78    85 
  29    83    84    78    86 
  83    84    21    78    21 
```

## 3. Landlook 4 Water Tile 12

- Priority: high
- Evidence: 524 placement(s)
- Suggested role: south (22%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 4, cell 12,3

Observed as lineVertical, mask 101. Center tile is wrapped in brackets.

```text
   2   163     2   163     2 
   2   164     2   164     2 
  18    76  [ 12]   76    12 
  60   111   111   111   111 
  18     1     1    13   112 
```

### Assault on Giant Mountain, land 5, cell 3,3

Observed as lineHorizontal, mask 250. Center tile is wrapped in brackets.

```text
  98   140    10   111   111 
 111   111    77   111   111 
  76    11  [ 12]   13   111 
 111     2   120    60   111 
 111     2    98    60   111 
```

### Assault on Giant Mountain, land 6, cell 10,6

Observed as capWest, mask 152. Center tile is wrapped in brackets.

```text
  31    41    26    41    26 
 111   111    77   111    77 
  15     1  [ 12]   74    12 
  60   152   126   126   126 
  49   169   127   176   127 
```

## 4. Landlook 5 Forest Tile 127

- Priority: critical
- Evidence: 135 placement(s)
- Suggested role: west (93%)
- Human-approved role(s): none
- Legacy fallback role(s): south, capSouth
- Review reasons: curated-role-disagreement
- Decision: pending

### City of Port Hyrtin, land 2, cell 77,72

Observed as west, mask 55. Center tile is wrapped in brackets.

```text
  70   149   154    11    23 
  61    70   123   124    39 
  61    82  [127]  126    39 
  61    81   127   126    39 
  61    62   127   126    39 
```

### Dark Portal, land 5, cell 42,8

Observed as west, mask 55. Center tile is wrapped in brackets.

```text
 191   192   191   191   191 
 154   191   123   128   128 
 192   192  [127]  121   121 
 191   191   127   121   121 
 154   192   127   121   121 
```

### Dark Portal, land 7, cell 50,25

Observed as west, mask 119. Center tile is wrapped in brackets.

```text
  60    31    28   123   124 
   7    28   123   121   126 
 191   191  [127]  121   126 
 128   128   121   121   126 
 121   121   121   129   125 
```

## 5. Landlook 5 Mountains Tile 63

- Priority: critical
- Evidence: 264 placement(s)
- Suggested role: southEast (77%)
- Human-approved role(s): none
- Legacy fallback role(s): south
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### City of Port Hyrtin, land 2, cell 44,3

Observed as southEast, mask 153. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    75    61 
  61    75  [ 63]  191    72 
  63   191   191   191   191 
 191   191   191   191   191 
```

### Dark Portal, land 5, cell 12,11

Observed as southEast, mask 153. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    76    76 
  74    75  [ 63]  191   191 
 192   192   191   191   191 
  48    50    48    50    48 
```

### Dark Portal, land 7, cell 31,22

Observed as southEast, mask 25. Center tile is wrapped in brackets.

```text
 169    61    61    61    61 
 169   169    61    61    61 
  74    74  [ 63]  191   191 
 192   192   192   192   191 
 192   191   191   191   191 
```

## 6. Landlook 5 Water Tile 3

- Priority: critical
- Evidence: 213 placement(s)
- Suggested role: west (97%)
- Human-approved role(s): none
- Legacy fallback role(s): north, capSouth
- Review reasons: curated-role-disagreement
- Decision: pending

### City of Port Hyrtin, land 2, cell 67,47

Observed as west, mask 55. Center tile is wrapped in brackets.

```text
 174   149   154     9     1 
 172   188    25    30    60 
 179   173  [  3]   60    60 
 175   194     3    60    60 
 188   178     3    60    60 
```

### Dark Portal, land 5, cell 76,6

Observed as west, mask 55. Center tile is wrapped in brackets.

```text
  80   192   191    18    60 
  81   192    17    60    60 
  80   191  [  3]   60    60 
  82   192     3    35    60 
  80   192     3    60    34 
```

### Dark Portal, land 7, cell 43,20

Observed as west, mask 55. Center tile is wrapped in brackets.

```text
 192   192   192   163   192 
 191   192    17     6     5 
 192   191  [  3]   60    60 
 191   191    18    60    60 
 191   192    13    60    60 
```

## 7. Landlook 9 Forest Tile 124

- Priority: critical
- Evidence: 153 placement(s)
- Suggested role: northEast (84%)
- Human-approved role(s): none
- Legacy fallback role(s): northWest, notchNorthWest
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 2, cell 20,60

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
 155   161   158   -16   158 
 160   158   164   158   118 
 159   123  [124]  120   156 
 123   121   121   124   158 
 121   121   121   121   124 
```

### City of Port Hyrtin, land 5, cell 32,24

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
 155   155   159   165    71 
 120   119   157   118   156 
 128   128  [124]  155   164 
 121   121   121   124   155 
 121   121   121   121   124 
```

### Dark Portal, land 8, cell 6,13

Observed as northEast, mask 236. Center tile is wrapped in brackets.

```text
 121   126   120   119   796 
 121   126   120   796   120 
 121   121  [124]  119   119 
 121   121   121   128   128 
 121   121   121   121   121 
```

## 8. Landlook 9 Mountains Tile 70

- Priority: critical
- Evidence: 339 placement(s)
- Suggested role: northEast (88%)
- Human-approved role(s): none
- Legacy fallback role(s): notchNorthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 2, cell 6,2

Observed as east, mask 237. Center tile is wrapped in brackets.

```text
  61    61    61    74   105 
  61    61    63    25    22 
  61    61  [ 70]   14    56 
  61    61    61    69    13 
  61    61    61    80     3 
```

### City of Bywater, land 3, cell 23,5

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  61    61    61    64   161 
  61    61    62   -63   -61 
  61    61  [ 70]  -62   -1060 
  61    61    82   164   190 
  61    61    80   163   190 
```

### City of Port Hyrtin, land 5, cell 47,14

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
 155   157   155   155   155 
 160   155   164   164   155 
  78    78  [ 70]  160   166 
  61    61    61    69   164 
  61    61    61    61    78 
```

## 9. Landlook 9 Water Tile 28

- Priority: critical
- Evidence: 118 placement(s)
- Suggested role: southEast (86%)
- Human-approved role(s): none
- Legacy fallback role(s): notchNorthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 2, cell 13,33

Observed as southEast, mask 201. Center tile is wrapped in brackets.

```text
  32    27    73    61    61 
  57    32    27    72    61 
  60    31  [ 28]   65    61 
  31    28    65    61    61 
  32    27    83    61    61 
```

### City of Bywater, land 3, cell 60,20

Observed as southEast, mask 153. Center tile is wrapped in brackets.

```text
  60    60    15   -1016   160 
  60    60    21    38    38 
   2     2  [ 28]  160   156 
 159   155   159   156   159 
  79    70   166   156   157 
```

### Dark Portal, land 8, cell 46,19

Observed as southEast, mask 201. Center tile is wrapped in brackets.

```text
  87    89    19   132   155 
  60    60    21   130    38 
  60    31  [ 28]  132   158 
  60     4    94   114    94 
  60     4   156   157   157 
```

## 10. Landlook 10 Forest Tile 125

- Priority: critical
- Evidence: 113 placement(s)
- Suggested role: southEast (96%)
- Human-approved role(s): none
- Legacy fallback role(s): northEast, notchNorthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Dark Portal, land 12, cell 76,31

Observed as south, mask 219. Center tile is wrapped in brackets.

```text
 121   121   121   121   121 
 121   121   121   121   121 
 121   121  [125]  122   121 
 121   125   119   156   122 
 125   120   156   120   156 
```

### Dungeon Map Test, land 0, cell 25,16

Observed as southEast, mask 137. Center tile is wrapped in brackets.

```text
 121   121   126   155   120 
 121   121   126   155   156 
 122   129  [125]  155   157 
 155   155   155   119   158 
 155   158   155   155   118 
```

### Half Truth, land 5, cell 82,26

Observed as southEast, mask 201. Center tile is wrapped in brackets.

```text
 128   124    73    61    61 
 121   121   124    85    61 
 121   121  [125]   73    74 
 121   126   118   162   163 
 121   126   120   120   118 
```

## 11. Landlook 10 Mountains Tile 62

- Priority: critical
- Evidence: 268 placement(s)
- Suggested role: southEast (70%)
- Human-approved role(s): none
- Legacy fallback role(s): east, lineVertical
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Dagger of Shine, land 5, cell 48,15

Observed as southEast, mask 153. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    76    75 
  74    75  [ 62]  166   155 
 166   166   162   158   155 
 155   155   150   155   155 
```

### Dark Portal, land 11, cell 68,2

Observed as southEast, mask 153. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    74    74 
  72    74  [ 62]  155   156 
 156   156   156   156    67 
  77    79    79    79    61 
```

### Dark Portal, land 12, cell 48,19

Observed as south, mask 155. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  76    61    61    61    61 
 156    71  [ 62]   72    61 
 155   -1016   158   158    71 
 155   158   157   157   158 
```

## 12. Landlook 10 Water Tile 4

- Priority: critical
- Evidence: 118 placement(s)
- Suggested role: east (98%)
- Human-approved role(s): none
- Legacy fallback role(s): northEast, capNorth
- Review reasons: curated-role-disagreement
- Decision: pending

### Dagger of Shine, land 5, cell 47,43

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  60    87   181    75    61 
  60    60    19   155    73 
  60    60  [  4]  -177   -175 
  60    60     4   -176   -1174 
  60    60    20   155   -1016 
```

### Dark Portal, land 12, cell 56,39

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  60    20   118   200   155 
  60    60    19   118   158 
  60    60  [  4]  118   158 
  60    60     4   118   191 
  60    60    16   118   156 
```

### Half Truth, land 5, cell 19,27

Observed as east, mask 237. Center tile is wrapped in brackets.

```text
  87    91    64   155   155 
  60    60    19   160   155 
  60    60  [  4]  155   155 
  60    60    32    27    25 
  58    60    60    32    30 
```

## 13. Landlook 4 Forest Tile 124

- Priority: medium
- Evidence: 138 placement(s)
- Suggested role: single (43%)
- Human-approved role(s): none
- Legacy fallback role(s): northWest, notchNorthWest
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 73,27

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  38    25   170   111   145 
  38    25   170   111   127 
  35    25  [124]  111   111 
  40    25   176   111   111 
  26     6    11    76     9 
```

### Assault on Giant Mountain, land 5, cell 67,14

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  36    24    24    34    25 
  25   111   111    38    42 
  25   111  [124]   38    25 
  65   111   111    38    25 
  37    39    39    35    42 
```

### Assault on Giant Mountain, land 6, cell 73,4

Observed as capEast, mask 18. Center tile is wrapped in brackets.

```text
   2   136   136   111    15 
  10   111   111   125    60 
  75   111  [124]  125     2 
  19     1     1    61    17 
  75   111   124   136    16 
```

## 14. Landlook 4 Mountains Tile 81

- Priority: critical
- Evidence: 324 placement(s)
- Suggested role: northEast (68%)
- Human-approved role(s): none
- Legacy fallback role(s): northWest
- Review reasons: curated-role-disagreement
- Decision: pending

### Araman's Ring, land 1, cell 66,41

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
  41    41    34    40    40 
 142   143    31    24    34 
  90    90  [ 81]  152    38 
  78    78    86    81    38 
  78    78    78    89    38 
```

### Assault on Giant Mountain, land 5, cell 79,16

Observed as northEast, mask 12. Center tile is wrapped in brackets.

```text
   9    32    40    40    40 
 111    31    24    34    40 
  79    90  [ 81]   38    40 
  88    95    89    38    40 
  88    95    89    38    40 
```

### Assault on Giant Mountain, land 6, cell 39,19

Observed as southWest, mask 179. Center tile is wrapped in brackets.

```text
  26    29    83    84    21 
  60    89    78    78    45 
  27    28  [ 81]   82    16 
  40    37    28    81    82 
  40    40    37    28    81 
```

## 15. Landlook 4 Water Tile 112

- Priority: high
- Evidence: 288 placement(s)
- Suggested role: single (22%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 4, cell 14,5

Observed as center, mask 191. Center tile is wrapped in brackets.

```text
  12    76    12    13   397 
 111   111   111    16    76 
   1    13  [112]  111   111 
 111    77   111   111    98 
   1    17   111   111    97 
```

### Assault on Giant Mountain, land 5, cell 52,5

Observed as north, mask 46. Center tile is wrapped in brackets.

```text
  24    41    24    26    24 
 163   113   113    75   111 
 164   111  [112]   48    28 
 111   163   111    38    42 
 152   164   123    38    25 
```

### Assault on Giant Mountain, land 6, cell 15,18

Observed as south, mask 187. Center tile is wrapped in brackets.

```text
 111   111    38    40    40 
   1    11     4    41    24 
  97     8  [112]  111   111 
 111    75    98   111   111 
  30    27    28   111   111 
```

## 16. Landlook 5 Forest Tile 126

- Priority: critical
- Evidence: 137 placement(s)
- Suggested role: east (95%)
- Human-approved role(s): none
- Legacy fallback role(s): north, lineVertical, capNorth
- Review reasons: curated-role-disagreement
- Decision: pending

### City of Port Hyrtin, land 2, cell 83,71

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
   7     8   188    84    61 
 123   128   124    85    61 
 121   121  [126]   85    61 
 121   121   126    71    61 
 121   121   126   191    73 
```

### Dark Portal, land 5, cell 51,8

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  38    38    38    38    45 
 128   128   124   120    39 
 121   121  [126]  192    39 
 121   121   126   192    39 
 121   121   126   191    39 
```

### Dark Portal, land 7, cell 52,24

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  19   192   165    73    61 
  28   123   124   191    72 
 123   121  [126]  191   192 
 127   121   126   191   191 
 121   121   126   191   191 
```

## 17. Landlook 5 Mountains Tile 73

- Priority: critical
- Evidence: 199 placement(s)
- Suggested role: southWest (79%)
- Human-approved role(s): none
- Legacy fallback role(s): notchSouthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### City of Port Hyrtin, land 2, cell 25,4

Observed as southWest, mask 147. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  76    76    61    61    61 
 166   191  [ 73]   74    75 
 191   191   191   191   162 
 191   191   191   191   191 
```

### Dark Portal, land 5, cell 68,2

Observed as southWest, mask 179. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  75    75    61    61    61 
 192   191  [ 73]   61    61 
 192   191   191    83    61 
 191   192   191    71    61 
```

### Dark Portal, land 7, cell 18,15

Observed as southWest, mask 83. Center tile is wrapped in brackets.

```text
 192   191    83    61    61 
 192   192    83    61    61 
 186   191  [ 73]   75    61 
  65    69   191   191    71 
  61    61    68   191   191 
```

## 18. Landlook 5 Water Tile 4

- Priority: critical
- Evidence: 114 placement(s)
- Suggested role: east (99%)
- Human-approved role(s): none
- Legacy fallback role(s): northEast, capNorth
- Review reasons: curated-role-disagreement
- Decision: pending

### Dark Portal, land 5, cell 67,9

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  33    20   191   191   192 
  60    60    19   192   192 
  60    60  [  4]  191   192 
  60    60     4   191   191 
  60    60     4   191   191 
```

### Dark Portal, land 7, cell 49,20

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
 192   191   192   191    84 
   1     1    27   192    71 
  60    60  [  4]  191   191 
  60    60    20   191   192 
  60    60    60    19   192 
```

### Destroy the Necronomicon, land 3, cell 7,3

Observed as east, mask 221. Center tile is wrapped in brackets.

```text
  60    60    33    15   191 
  60    60    31    28   191 
  60    60  [  4]  192   187 
  60    31    28   173   192 
  31    28   191   190   165 
```

## 19. Landlook 9 Forest Tile 125

- Priority: critical
- Evidence: 168 placement(s)
- Suggested role: southEast (86%)
- Human-approved role(s): none
- Legacy fallback role(s): northEast, notchNorthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### City of Port Hyrtin, land 5, cell 36,30

Observed as southEast, mask 201. Center tile is wrapped in brackets.

```text
 121   121   126    84    61 
 121   121   126    84    61 
 121   121  [125]   83    61 
 121   126    67    61    61 
 121   125    85    61    61 
```

### Dark Portal, land 8, cell 6,7

Observed as southEast, mask 217. Center tile is wrapped in brackets.

```text
 121   121   121   121   121 
 121   121   121   129   129 
 121   121  [125]  120   119 
 121   126   120   796   120 
 121   126   119   120   796 
```

### Destroy the Necronomicon, land 4, cell 41,17

Observed as southEast, mask 201. Center tile is wrapped in brackets.

```text
 158   121   126   157   118 
 123   121   126   119   158 
 121   121  [125]  158   158 
 121   126   158   158   118 
 121   126   119   158   158 
```

## 20. Landlook 9 Mountains Tile 73

- Priority: critical
- Evidence: 290 placement(s)
- Suggested role: southWest (88%)
- Human-approved role(s): none
- Legacy fallback role(s): notchSouthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 2, cell 30,3

Observed as center, mask 191. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    61    61 
  61    62  [ 73]   61    61 
  63   157    65    61    61 
 158   165    71    61    61 
```

### City of Bywater, land 3, cell 13,1

Observed as southWest, mask 179. Center tile is wrapped in brackets.

```text
 out   out   out   out   out 
  74    74    61    61    61 
 162   167  [ 73]   61    61 
 163   162   164    73    61 
 165   165   164   161    73 
```

### City of Port Hyrtin, land 5, cell 46,3

Observed as southWest, mask 179. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  76    76    61    61    61 
 155   164  [ 73]   61    61 
 155   155   155    73    74 
 155   159   161   155   155 
```

## 21. Landlook 9 Water Tile 2

- Priority: critical
- Evidence: 227 placement(s)
- Suggested role: south (82%)
- Human-approved role(s): none
- Legacy fallback role(s): east, capWest
- Review reasons: curated-role-disagreement
- Decision: pending

### City of Bywater, land 3, cell 58,20

Observed as south, mask 155. Center tile is wrapped in brackets.

```text
   3    60    60    60    15 
   3    60    60    60    21 
  14     7  [  2]    2    28 
  69   160   159   155   159 
  61    78    79    70   166 
```

### City of Port Hyrtin, land 5, cell 81,75

Observed as south, mask 155. Center tile is wrapped in brackets.

```text
  60    60    60    60    60 
  60    60    60    60    60 
  60     7  [  2]    2     2 
  90    70   167   155   150 
  61    61    69   155   161 
```

### Dark Portal, land 8, cell 78,32

Observed as south, mask 155. Center tile is wrapped in brackets.

```text
 157    13    60    15   156 
 157     3    60     4   158 
  19    26  [  2]   28   158 
  20   158   155   158   156 
  60    19   156   156   123 
```

## 22. Landlook 10 Forest Tile 123

- Priority: critical
- Evidence: 134 placement(s)
- Suggested role: northWest (97%)
- Human-approved role(s): none
- Legacy fallback role(s): southEast, notchSouthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Dark Portal, land 12, cell 74,25

Observed as northWest, mask 102. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    75    76    76 
  61    62  [123]  128   124 
  63   123   121   121   126 
 123   121   121   121   121 
```

### Dungeon Map Test, land 0, cell 21,8

Observed as northWest, mask 102. Center tile is wrapped in brackets.

```text
 158   156   158   155   156 
 155   119   157   157   156 
 118   119  [123]  128   124 
 120   123   121   121   121 
 123   121   121   121   121 
```

### Half Truth, land 5, cell 75,22

Observed as northWest, mask 102. Center tile is wrapped in brackets.

```text
  78    68   155   155    42 
  61    82   155   155   155 
  61    62  [123]  128   124 
  62   123   121   121   121 
 128   121   121   121   121 
```

## 23. Landlook 10 Mountains Tile 70

- Priority: critical
- Evidence: 282 placement(s)
- Suggested role: northEast (71%)
- Human-approved role(s): none
- Legacy fallback role(s): notchNorthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Dagger of Shine, land 5, cell 54,21

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
 155   155   155   155   155 
 155   155   155   155   155 
  65    77  [ 70]  155   155 
  61    61    61    70   155 
  61    61    61    61    79 
```

### Dark Portal, land 11, cell 73,3

Observed as northEast, mask 76. Center tile is wrapped in brackets.

```text
  74    74    75    74    61 
 157   157   155   156    84 
  78    79  [ 70]  157    72 
  61    76    64   158   157 
  64   158   158    67    79 
```

### Dark Portal, land 12, cell 47,23

Observed as capWest, mask 72. Center tile is wrapped in brackets.

```text
  82   155   158   157   157 
  81   157   157   156   158 
  61    78  [ 70]  158    66 
  61    61   169   180    61 
  61    61   169    61    61 
```

## 24. Landlook 10 Water Tile 35

- Priority: high
- Evidence: 56 placement(s)
- Suggested role: center (16%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Half Truth, land 5, cell 21,57

Observed as center, mask 255. Center tile is wrapped in brackets.

```text
  91    89    60    60    60 
  60    60    60    60    60 
  60    60  [ 35]   60    60 
  88    60    60    60    60 
  93    60    60    34    60 
```

### Lord of the Abyss, land 5, cell 81,32

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
   1     1     1   117     1 
  60    60    60   115    60 
  60    60  [ 35]  115    60 
  60    60    60   115    60 
  60    60    60   115    60 
```

### Price of Power, land 1, cell 64,1

Observed as northWest, mask 38. Center tile is wrapped in brackets.

```text
 out   out   out   out   out 
  61    61    91    91    91 
  61    93  [ 35]   60    35 
  75    89    60    33    60 
  17    34    60    60    60 
```

## 25. Landlook 4 Forest Tile 128

- Priority: medium
- Evidence: 1636 placement(s)
- Suggested role: single (43%)
- Human-approved role(s): none
- Legacy fallback role(s): east, lineHorizontal, capEast
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 84,47

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  39    28   111    23    31 
  40    42   486   111   111 
  24    29  [128]   21    30 
 111   111   111     2    38 
  39    39    39    27    35 
```

### Assault on Giant Mountain, land 4, cell 13,18

Observed as capSouth, mask 4. Center tile is wrapped in brackets.

```text
 111   111    77   111   111 
   1    11    12     1    11 
 137     2  [128]  111    77 
 138     2   127   111    16 
 136     2   111   111   111 
```

### Assault on Giant Mountain, land 6, cell 70,58

Observed as lineVertical, mask 5. Center tile is wrapped in brackets.

```text
 127   158   126   158    10 
 126   159   126   161    45 
 127   159  [128]  159    45 
 126   161   126   159    10 
 128   162   128   162    45 
```

## 26. Landlook 4 Mountains Tile 69

- Priority: critical
- Evidence: 287 placement(s)
- Suggested role: single (69%)
- Human-approved role(s): none
- Legacy fallback role(s): notchNorthWest
- Review reasons: curated-role-disagreement
- Decision: pending

### Assault on Giant Mountain, land 4, cell 17,31

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 111    98    38    40    40 
   1     1    32    40    40 
 111   111  [ 69]   40    40 
   1     1    32    40    40 
 111   111    38    40    40 
```

### Assault on Giant Mountain, land 5, cell 30,5

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 111   111   111    38    40 
 111    95    95    38    40 
 111    95  [ 69]   38    40 
  39    39    39    35    40 
  40    40    40    40    40 
```

### Assault on Giant Mountain, land 6, cell 7,37

Observed as capWest, mask 200. Center tile is wrapped in brackets.

```text
  86    81    38    40    40 
  78    86    38    40    36 
  78    80  [ 69]   40    25 
  80    83    38    40    37 
  83    30    35    40    40 
```

## 27. Landlook 4 Water Tile 17

- Priority: high
- Evidence: 608 placement(s)
- Suggested role: east (22%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 4, cell 6,4

Observed as north, mask 190. Center tile is wrapped in brackets.

```text
 157   111     2   111     2 
 111   111    77   111     2 
  15     1  [ 17]  111     2 
   2   140     2   111     2 
  14   140     2   111     2 
```

### Assault on Giant Mountain, land 5, cell 17,13

Observed as lineHorizontal, mask 250. Center tile is wrapped in brackets.

```text
  36    24    26     6    76 
  42   111    77   111   111 
  33     1  [ 17]  111   152 
  42   111    77   111   111 
  33     1    17   111   152 
```

### Assault on Giant Mountain, land 6, cell 75,5

Observed as lineVertical, mask 37. Center tile is wrapped in brackets.

```text
 111   125    60   130   132 
 124   125     2   130   133 
   1    61  [ 17]  129   133 
 124   136    16     1    74 
 111   136   136   136   111 
```

## 28. Landlook 5 Forest Tile 122

- Priority: medium
- Evidence: 62 placement(s)
- Suggested role: southWest (71%)
- Human-approved role(s): none
- Legacy fallback role(s): southWest, notchSouthWest
- Review reasons: many-neighbor-shapes
- Decision: pending

### City of Port Hyrtin, land 2, cell 75,80

Observed as southWest, mask 51. Center tile is wrapped in brackets.

```text
  61    81   127   121   121 
  61    81   127   121   121 
  61    80  [122]  121   121 
  61    61    69   122   121 
  61    61    61    69   122 
```

### Dark Portal, land 5, cell 48,26

Observed as southWest, mask 179. Center tile is wrapped in brackets.

```text
 121   121   121   121   121 
 129   129   121   121   121 
 191   192  [122]  121   121 
 192   191   192   127   121 
 191   192   191   127   121 
```

### Dark Portal, land 7, cell 47,29

Observed as southWest, mask 19. Center tile is wrapped in brackets.

```text
 164   161   127   121   121 
  70   189   127   121   121 
  61    70  [122]  129   125 
  61    61    79    70   191 
  61    61    61    61    79 
```

## 29. Landlook 5 Mountains Tile 70

- Priority: critical
- Evidence: 212 placement(s)
- Suggested role: northEast (81%)
- Human-approved role(s): none
- Legacy fallback role(s): notchNorthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### City of Port Hyrtin, land 2, cell 7,5

Observed as northEast, mask 76. Center tile is wrapped in brackets.

```text
  74    76    75    76    61 
 133   133   133   141    85 
  78    79  [ 70]  132    84 
  61    61    80   132    83 
  61    61    81   132    83 
```

### Dark Portal, land 5, cell 65,30

Observed as northEast, mask 204. Center tile is wrapped in brackets.

```text
  69   149   154   192    85 
  61    68   148   156    85 
  61    61  [ 70]  191    83 
  61    61    61   114    61 
  75    75    62   191    85 
```

### Dark Portal, land 7, cell 1,8

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
 out   191   191   191   191 
 out   191   191   191   191 
 out    77  [ 70]  191   162 
 out    61    61    70   191 
 out    61    61    61    77 
```

## 30. Landlook 5 Water Tile 36

- Priority: high
- Evidence: 169 placement(s)
- Suggested role: single (23%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Elemental Strife, land 1, cell 54,14

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 165   187   188   190   189 
 166   191   191   149   155 
 192   192  [ 36]  191   191 
 192   191   177   192   192 
 192   192   119   191   191 
```

### Journey into the Mire, land 1, cell 45,8

Observed as capEast, mask 2. Center tile is wrapped in brackets.

```text
  75    62   192   192   191 
 192   191   191   192   191 
 192   192  [ 36]   36    36 
 191   191   190   190   194 
 191   192   187   187   187 
```

### Mithril Vault, land 5, cell 15,34

Observed as capSouth, mask 36. Center tile is wrapped in brackets.

```text
 191   191   192   191   191 
  94    98   191   191   191 
 191    95  [ 36]  191   191 
 191    95    36    36   192 
 191   113    36    36   191 
```

## 31. Landlook 9 Forest Tile 123

- Priority: critical
- Evidence: 223 placement(s)
- Suggested role: northWest (87%)
- Human-approved role(s): none
- Legacy fallback role(s): southEast, notchSouthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 2, cell 19,60

Observed as northWest, mask 102. Center tile is wrapped in brackets.

```text
 160   155   161   158   -16 
 158   160   158   164   158 
 158   159  [123]  124   120 
 159   123   121   121   124 
 123   121   121   121   121 
```

### City of Port Hyrtin, land 5, cell 27,24

Observed as northWest, mask 102. Center tile is wrapped in brackets.

```text
  61    82   160   162   157 
  61    64   120   155   119 
  81   118  [123]  128   128 
  81   123   121   121   121 
  64   127   121   121   121 
```

### Dark Portal, land 8, cell 11,13

Observed as northWest, mask 118. Center tile is wrapped in brackets.

```text
 120   119   120   127   121 
 118   119   119   127   121 
 120   119  [123]  121   121 
 128   128   121   121   121 
 121   121   121   121   121 
```

## 32. Landlook 9 Mountains Tile 69

- Priority: critical
- Evidence: 311 placement(s)
- Suggested role: northEast (88%)
- Human-approved role(s): none
- Legacy fallback role(s): notchNorthWest
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 2, cell 7,3

Observed as northEast, mask 204. Center tile is wrapped in brackets.

```text
  61    63    25    22    27 
  61    70    14    56    16 
  61    61  [ 69]   13    19 
  61    61    80     3    16 
  61    61    82     3    19 
```

### City of Bywater, land 3, cell 49,6

Observed as northEast, mask 204. Center tile is wrapped in brackets.

```text
 158   157   156   155   156 
  66    68   156   155   157 
  61    61  [ 69]  158   155 
  61    61    81   197   158 
  61    61    80   156    67 
```

### City of Port Hyrtin, land 5, cell 62,11

Observed as northEast, mask 76. Center tile is wrapped in brackets.

```text
 165   155   155   155   160 
 155   155   157   166   155 
  79    77  [ 69]  155   155 
  61    61    82   167   155 
  61    61    61    78    69 
```

## 33. Landlook 9 Water Tile 1

- Priority: critical
- Evidence: 210 placement(s)
- Suggested role: north (82%)
- Human-approved role(s): none
- Legacy fallback role(s): northWest, capEast
- Review reasons: curated-role-disagreement
- Decision: pending

### Assault on Giant Mountain, land 2, cell 7,28

Observed as north, mask 238. Center tile is wrapped in brackets.

```text
  20   158    83    61    61 
  13    19    72    75    75 
   3    32  [  1]    1     1 
  18    60    33    35    60 
  60    56    60    60    34 
```

### City of Bywater, land 3, cell 64,18

Observed as north, mask 126. Center tile is wrapped in brackets.

```text
 158   160   160   156   156 
 158   156   156    25    27 
 160    25  [  1]   30     4 
  38    24    34    33     4 
 156    26     2     2    28 
```

### City of Port Hyrtin, land 5, cell 83,66

Observed as north, mask 110. Center tile is wrapped in brackets.

```text
  61    61    61    63   155 
  61    76    64   160   155 
  64    25  [  1]    1   117 
   1    30    60    60   115 
  60    60    60    60   115 
```

## 34. Landlook 10 Forest Tile 124

- Priority: critical
- Evidence: 139 placement(s)
- Suggested role: northEast (99%)
- Human-approved role(s): none
- Legacy fallback role(s): northWest, notchNorthWest
- Review reasons: curated-role-disagreement
- Decision: pending

### Dark Portal, land 12, cell 76,25

Observed as northEast, mask 76. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  75    76    76    61    61 
 123   128  [124]   84    61 
 121   121   126    71    64 
 121   121   121   128   128 
```

### Dungeon Map Test, land 0, cell 23,8

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
 158   155   156   156   167 
 157   157   156   118   156 
 123   128  [124]  120   119 
 121   121   121   124   120 
 121   121   121   121   124 
```

### Half Truth, land 5, cell 77,22

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
 155   155    42    51    85 
 155   155   155   118    83 
 123   128  [124]  160    72 
 121   121   121   128   124 
 121   121   121   121   121 
```

## 35. Landlook 10 Mountains Tile 63

- Priority: critical
- Evidence: 238 placement(s)
- Suggested role: southEast (72%)
- Human-approved role(s): none
- Legacy fallback role(s): south
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Dagger of Shine, land 5, cell 56,13

Observed as southEast, mask 153. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    74    61 
  75    75  [ 63]  158    71 
 155   155   157   162   160 
 155   155   155   155   160 
```

### Dark Portal, land 11, cell 53,3

Observed as southEast, mask 217. Center tile is wrapped in brackets.

```text
 169    61    61    61    61 
  61    61    61    75    61 
  61    61  [ 63]  155    84 
  61    62   155   156    83 
  62   158   155   157    73 
```

### Dark Portal, land 12, cell 72,26

Observed as southEast, mask 217. Center tile is wrapped in brackets.

```text
  61    61    61    61    75 
  61    61    61    62   123 
  61    61  [ 63]  123   121 
  61    62   123   121   121 
  82   123   121   121   121 
```

## 36. Landlook 10 Water Tile 24

- Priority: high
- Evidence: 8 placement(s)
- Suggested role: center (50%)
- Human-approved role(s): none
- Legacy fallback role(s): southEast
- Review reasons: insufficient-evidence, mixed-structural-roles
- Decision: pending

### Hax, land 5, cell 35,13

Observed as center, mask 63. Center tile is wrapped in brackets.

```text
 157    95     3    31    29 
 154    95     3    32    30 
  38    38  [ 24]   60    60 
 141    95     3    60    31 
 132    95     3    60    32 
```

### Mithril Vault, land 6, cell 4,86

Observed as lineHorizontal, mask 58. Center tile is wrapped in brackets.

```text
  90    90    88    60    60 
  61    61    89    60    60 
  61   108  [ 24]   60    57 
  61    61    88    59    60 
  61    61    61    90    90 
```

### Price of Power, land 1, cell 64,43

Observed as center, mask 63. Center tile is wrapped in brackets.

```text
 155   160    17    35    87 
 158   156     3    60    60 
  38    38  [ 24]   60    60 
 157   158     3    60    60 
 160   156    18    34    60 
```

## 37. Landlook 4 Forest Tile 125

- Priority: medium
- Evidence: 257 placement(s)
- Suggested role: single (45%)
- Human-approved role(s): none
- Legacy fallback role(s): northEast, notchNorthEast
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 19,1

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 out   out   out   out   out 
  36    24    24    24    24 
  25   152  [125]  486   111 
  25   496   495   111   111 
  25   139   466   111   111 
```

### Assault on Giant Mountain, land 5, cell 11,10

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 111    38    40    40    40 
 111    47    24    34    40 
 111    77  [125]   38    40 
  15    12     3    35    40 
  14   136    38    40    40 
```

### Assault on Giant Mountain, land 6, cell 74,3

Observed as capSouth, mask 68. Center tile is wrapped in brackets.

```text
 139   136   137   111   137 
 136   136   111    15     1 
 111   111  [125]   60   130 
 111   124   125     2   130 
   1     1    61    17   129 
```

## 38. Landlook 4 Mountains Tile 70

- Priority: high
- Evidence: 123 placement(s)
- Suggested role: south (16%)
- Human-approved role(s): none
- Legacy fallback role(s): notchNorthEast
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 5, cell 61,9

Observed as capSouth, mask 20. Center tile is wrapped in brackets.

```text
  40    42   111   111   111 
  40    33     7    74     9 
  40    25  [ 70]  102    73 
  40    42    70   102    73 
  40    25    98   103    99 
```

### Assault on Giant Mountain, land 6, cell 76,41

Observed as capEast, mask 2. Center tile is wrapped in brackets.

```text
 111    38    40    40    40 
 111    47    41    41    34 
 111     2  [ 70]   91    38 
 111     2   111   111    38 
 111    77   111   111    38 
```

### City of Bywater, land 4, cell 9,36

Observed as southWest, mask 3. Center tile is wrapped in brackets.

```text
  96    40    96    40    40 
  64    26    64    51    24 
 111    60  [ 70]   72   182 
 111    60   182   182   182 
 111    60    72    72   182 
```

## 39. Landlook 4 Water Tile 19

- Priority: high
- Evidence: 257 placement(s)
- Suggested role: center (24%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 76,29

Observed as center, mask 255. Center tile is wrapped in brackets.

```text
 111   111    38    40    40 
 111   111    38    40    40 
  76     9  [ 19]   24    24 
 111   111     2   111   145 
  28   486    77   111   127 
```

### Assault on Giant Mountain, land 4, cell 10,11

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
   2   111    18    61    61 
   2   111     2   123   123 
  12     1  [ 19]   61    61 
 111   111    60   -97   111 
  13   111    18     1     1 
```

### Assault on Giant Mountain, land 5, cell 57,14

Observed as west, mask 151. Center tile is wrapped in brackets.

```text
 123   384    97    38    40 
  13   111    30    35    40 
  18    74  [ 19]   24    41 
  77    93     2   146   111 
  49    93    60   145   111 
```

## 40. Landlook 5 Forest Tile 125

- Priority: medium
- Evidence: 51 placement(s)
- Suggested role: southEast (77%)
- Human-approved role(s): none
- Legacy fallback role(s): northEast, notchNorthEast
- Review reasons: many-neighbor-shapes
- Decision: pending

### City of Port Hyrtin, land 2, cell 87,83

Observed as southEast, mask 201. Center tile is wrapped in brackets.

```text
 127   121   126    83    61 
 127   121   126    84    61 
 127   121  [125]   83    61 
 122   125    65    61    61 
 163    66    61    61    61 
```

### Dark Portal, land 5, cell 51,18

Observed as southEast, mask 201. Center tile is wrapped in brackets.

```text
 121   121   126   118    39 
 121   121   126   118    39 
 121   121  [125]  192    39 
 121   125   118   192    46 
 126   120   191   191    39 
```

### Dark Portal, land 7, cell 52,27

Observed as southEast, mask 137. Center tile is wrapped in brackets.

```text
 127   121   126   191   191 
 121   121   126   191   191 
 121   129  [125]  191   191 
 125   -59   -1057   191   191 
 191   -58   -56   191    66 
```

## 41. Landlook 5 Mountains Tile 69

- Priority: critical
- Evidence: 206 placement(s)
- Suggested role: northEast (83%)
- Human-approved role(s): none
- Legacy fallback role(s): notchNorthWest
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### City of Port Hyrtin, land 2, cell 12,15

Observed as northEast, mask 236. Center tile is wrapped in brackets.

```text
 133   133   141    73    61 
  78    70   142   141    73 
  61    61  [ 69]  142   133 
  61    61    61    78    68 
  61    61    61    61    61 
```

### Dark Portal, land 5, cell 63,28

Observed as northEast, mask 236. Center tile is wrapped in brackets.

```text
  61    61    62   196   191 
  61    81   150   158   191 
  61    61  [ 69]  149   154 
  61    61    61    68   148 
  61    61    61    61    70 
```

### Dark Portal, land 7, cell 64,12

Observed as northEast, mask 76. Center tile is wrapped in brackets.

```text
 191   191   192   166   191 
  70   166   192   191   192 
  61    78  [ 69]  191   191 
  61    61    80   191   192 
  61    61    61    77    69 
```

## 42. Landlook 5 Water Tile 107

- Priority: high
- Evidence: 7 placement(s)
- Suggested role: capWest (57%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: insufficient-evidence
- Decision: pending

### Destroy the Necronomicon, land 3, cell 69,35

Observed as capWest, mask 72. Center tile is wrapped in brackets.

```text
  71    61    61    61    61 
 191    71    61    61    61 
  27    48  [107]   61    61 
  21    51    83    61    61 
  28    66    61    61    61 
```

### Search for the Lost City, land 3, cell 88,5

Observed as capWest, mask 72. Center tile is wrapped in brackets.

```text
 113   192   191    85   out 
  99   191    65    61   out 
 191    48  [107]   61   out 
 192    39    72    61   out 
  38    51   192    83   out 
```

## 43. Landlook 9 Forest Tile 127

- Priority: critical
- Evidence: 240 placement(s)
- Suggested role: west (90%)
- Human-approved role(s): none
- Legacy fallback role(s): south, capSouth
- Review reasons: curated-role-disagreement
- Decision: pending

### Assault on Giant Mountain, land 2, cell 17,63

Observed as west, mask 55. Center tile is wrapped in brackets.

```text
  61    81   159   123   121 
  61    82   123   121   121 
  61    81  [127]  121   121 
  61    82   127   121   121 
  61    80   122   121   121 
```

### City of Port Hyrtin, land 5, cell 26,26

Observed as west, mask 119. Center tile is wrapped in brackets.

```text
  61    81   118   123   128 
  61    81   123   121   121 
  74    64  [127]  121   121 
 123   128   121   121   121 
 121   121   121   121   121 
```

### Dark Portal, land 8, cell 12,8

Observed as west, mask 183. Center tile is wrapped in brackets.

```text
 129   121   121   121   121 
 120   122   121   121   121 
 119   120  [127]  121   121 
 120   119   127   121   121 
 155   120   127   121   121 
```

## 44. Landlook 9 Mountains Tile 62

- Priority: critical
- Evidence: 328 placement(s)
- Suggested role: southEast (89%)
- Human-approved role(s): none
- Legacy fallback role(s): east, lineVertical
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 2, cell 60,1

Observed as south, mask 251. Center tile is wrapped in brackets.

```text
 out   out   out   out   out 
  61    61    61    61    61 
  61    61  [ 62]   85    61 
  61    82   -1016    83    61 
  61    81   156    85    61 
```

### City of Bywater, land 3, cell 4,2

Observed as southEast, mask 217. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    75    63 
  61    61  [ 62]  161   162 
  61    63   165   167   162 
  64   162   166   165   162 
```

### City of Port Hyrtin, land 5, cell 41,3

Observed as southEast, mask 153. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    75    75 
  74    76  [ 62]  155   158 
 167   155   159   157   155 
 161   155   155   155   167 
```

## 45. Landlook 9 Water Tile 4

- Priority: critical
- Evidence: 310 placement(s)
- Suggested role: east (88%)
- Human-approved role(s): none
- Legacy fallback role(s): northEast, capNorth
- Review reasons: curated-role-disagreement
- Decision: pending

### Assault on Giant Mountain, land 2, cell 5,14

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  80   158    18    16    85 
  81    17    15    67    61 
  82     3  [  4]   84    61 
  80     3     4   182   169 
  62    18     4    85    61 
```

### City of Bywater, land 3, cell 66,18

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
 160   156   156   156   156 
 156    25    27   157   158 
   1    30  [  4]  160   157 
  34    33     4   156   155 
   2     2    28   156   158 
```

### Dark Portal, land 8, cell 40,3

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  60    87    74    61    75 
  60    60    19    95   165 
  60    60  [  4]   95    65 
  60    60     4    95    83 
  60    60     4    95    84 
```

## 46. Landlook 10 Forest Tile 129

- Priority: critical
- Evidence: 158 placement(s)
- Suggested role: south (99%)
- Human-approved role(s): none
- Legacy fallback role(s): west, capWest
- Review reasons: curated-role-disagreement
- Decision: pending

### Dark Portal, land 12, cell 79,32

Observed as south, mask 155. Center tile is wrapped in brackets.

```text
 121   121   121   121   121 
 122   121   121   121   121 
 156   122  [129]  129   125 
 120   156    67    78    79 
 119    66    61    61    61 
```

### Dungeon Map Test, land 0, cell 21,13

Observed as south, mask 187. Center tile is wrapped in brackets.

```text
 127   121   121   121   121 
 122   121   121   121   121 
 120   122  [129]  121   121 
 118   118   118   127   121 
 158   119   118   122   121 
```

### Half Truth, land 5, cell 78,25

Observed as south, mask 251. Center tile is wrapped in brackets.

```text
 121   121   128   124    72 
 121   121   121   121   128 
 121   121  [129]  121   121 
 121   126   158   127   121 
 121   121   128   121   121 
```

## 47. Landlook 10 Mountains Tile 73

- Priority: critical
- Evidence: 246 placement(s)
- Suggested role: southWest (72%)
- Human-approved role(s): none
- Legacy fallback role(s): notchSouthEast
- Review reasons: curated-role-disagreement, many-neighbor-shapes
- Decision: pending

### Dagger of Shine, land 5, cell 59,14

Observed as southWest, mask 179. Center tile is wrapped in brackets.

```text
  74    61    61    61    61 
 158    71    61    61    61 
 162   160  [ 73]   61    61 
 155   160   155    85    61 
 155   155   156    73    75 
```

### Dark Portal, land 11, cell 86,2

Observed as center, mask 191. Center tile is wrapped in brackets.

```text
  61    61    61    61    61 
  61    61    61    61    61 
  61    64  [ 73]   61    61 
  63   -1002    67    61    61 
 156    67    61    61    61 
```

### Dark Portal, land 12, cell 77,42

Observed as southWest, mask 19. Center tile is wrapped in brackets.

```text
 156   156    85    61    61 
 155   158    83    61    61 
 157   158  [ 73]   74    63 
 119   157   156   156   155 
 158   158   118   157   158 
```

## 48. Landlook 10 Water Tile 45

- Priority: high
- Evidence: 6 placement(s)
- Suggested role: north (50%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: insufficient-evidence, mixed-structural-roles
- Decision: pending

### Hax, land 5, cell 50,51

Observed as center, mask 191. Center tile is wrapped in brackets.

```text
  56    60    60    60    31 
  11    23     2     2    28 
 158    49  [ 45]   50   158 
 155   155    39    49    50 
 155   158    39   155    49 
```

### Price of Power, land 1, cell 71,23

Observed as north, mask 158. Center tile is wrapped in brackets.

```text
  49    50   156    39   127 
 155    39   155    39   127 
 157    49  [ 45]   51   127 
 155   155    39   155   127 
 160   155    39   158   127 
```

### War in the Sword Lands, land 4, cell 71,12

Observed as north, mask 142. Center tile is wrapped in brackets.

```text
  50   157   159   156   158 
  49    50   164   156    48 
 158    49  [ 45]   38    51 
 156   157    39   158   165 
 160   167    39   163    67 
```

