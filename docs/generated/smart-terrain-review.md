# Smart Terrain First Review Batch

Generated: 2026-07-11T19:44:02.947Z

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

## 4. Landlook 4 Forest Tile 124

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

## 5. Landlook 4 Mountains Tile 81

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

## 6. Landlook 4 Water Tile 112

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

## 7. Landlook 4 Forest Tile 128

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

## 8. Landlook 4 Mountains Tile 69

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

## 9. Landlook 4 Water Tile 17

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

## 10. Landlook 4 Forest Tile 125

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

## 11. Landlook 4 Mountains Tile 70

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

## 12. Landlook 4 Water Tile 19

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

## 13. Landlook 4 Forest Tile 126

- Priority: medium
- Evidence: 987 placement(s)
- Suggested role: single (49%)
- Human-approved role(s): none
- Legacy fallback role(s): north, lineVertical, capNorth
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 4, cell 40,5

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  15     1     1    13   111
  77   111   111     2   111
  60   158  [126]    2   111
  60   162   170     2   111
  16     1     1    14   111
```

### Assault on Giant Mountain, land 5, cell 9,2

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  26    41    24    26    24
   2   111   111    77    93
  77   111  [126]    2    93
   2   111   158     2    93
  10   111   162    48    39
```

### Assault on Giant Mountain, land 6, cell 10,7

Observed as northWest, mask 6. Center tile is wrapped in brackets.

```text
 111   111    77   111    77
  15     1    12    74    12
  60   152  [126]  126   126
  49   169   127   176   127
  43   170   127   127   127
```

## 14. Landlook 4 Mountains Tile 71

- Priority: high
- Evidence: 1977 placement(s)
- Suggested role: lineVertical (20%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 6, cell 69,17

Observed as capSouth, mask 4. Center tile is wrapped in brackets.

```text
  94    94    94    94    93
  76     1     1     3    39
  97   110  [ 71]   38    40
 111   102    71    57    40
 120   109    71    47    41
```

### Castle in the Clouds, land 5, cell 17,27

Observed as northWest, mask 102. Center tile is wrapped in brackets.

```text
  29   111   111   111   111
 117   105   100   100   106
 100   109  [ 71]   71   101
  71    71    71    71   101
  99   110    71    71   101
```

### Castle in the Clouds, land 7, cell 62,20

Observed as northWest, mask 6. Center tile is wrapped in brackets.

```text
 111     2   176   111   111
 111     2   100   100   100
 111    60  [ 71]   71    71
 111    60    71   183    71
 111     2    71    71    71
```

## 15. Landlook 4 Water Tile 18

- Priority: high
- Evidence: 562 placement(s)
- Suggested role: west (27%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 4, cell 10,3

Observed as east, mask 237. Center tile is wrapped in brackets.

```text
   2   111     2   163     2
   2   111     2   164     2
   2   111  [ 18]   76    12
   2   111    60   111   111
   2   111    18     1     1
```

### Assault on Giant Mountain, land 5, cell 4,6

Observed as center, mask 31. Center tile is wrapped in brackets.

```text
   2   120    60   111   111
   2    98    60   111   111
  14   111  [ 18]    1    74
 111   126    60   129    91
 137   148    10   131   111
```

### Assault on Giant Mountain, land 6, cell 66,16

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  10   111    60    93    31
  75   111    10    94    94
   8   111  [ 18]   76     1
  17   111     2    97   110
  10   111    10   111   102
```

## 16. Landlook 4 Forest Tile 127

- Priority: medium
- Evidence: 936 placement(s)
- Suggested role: single (54%)
- Human-approved role(s): none
- Legacy fallback role(s): south, capSouth
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 75,26

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  24    24    24    34    40
 170   111   145    38    40
 170   111  [127]   38    40
 124   111   111    38    40
 176   111   111    38    40
```

### Assault on Giant Mountain, land 4, cell 39,9

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 111    16     1     1    14
 111   111   111   111   111
 131   131  [127]  176   111
   1     1    11     1    76
 111   111     2   149   111
```

### Assault on Giant Mountain, land 5, cell 9,5

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
   2   111   158     2    93
  10   111   162    48    39
  60   152  [127]   38    40
  12     9    76    32    40
 152   111   111    38    40
```

## 17. Landlook 4 Mountains Tile 73

- Priority: high
- Evidence: 2217 placement(s)
- Suggested role: center (23%)
- Human-approved role(s): none
- Legacy fallback role(s): notchSouthEast
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 62,17

Observed as north, mask 110. Center tile is wrapped in brackets.

```text
 111   111    40    40    40
 111   111   111   111   111
  72    72  [ 73]   73    73
  72    73    73    73    73
  72    72    73    73    73
```

### Assault on Giant Mountain, land 5, cell 63,9

Observed as capSouth, mask 132. Center tile is wrapped in brackets.

```text
 111   111   111    38    40
   7    74     9    32    40
  70   102  [ 73]   53    40
  70   102    73    38    40
  98   103    99    38    40
```

### Castle in the Clouds, land 5, cell 46,72

Observed as capEast, mask 2. Center tile is wrapped in brackets.

```text
  98   111   111   111   111
   1     1     1     1     1
 111   111  [ 73]   73    73
  39    39    39    39    39
  40    40    40    40    40
```

## 18. Landlook 4 Water Tile 11

- Priority: high
- Evidence: 487 placement(s)
- Suggested role: north (28%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 73,29

Observed as northEast, mask 188. Center tile is wrapped in brackets.

```text
  35    25   124   111   111
  40    25   176   111   111
  26     6  [ 11]   76     9
   2   152    10   111   111
  77   111    48    28   486
```

### Assault on Giant Mountain, land 4, cell 39,10

Observed as north, mask 78. Center tile is wrapped in brackets.

```text
 111   111   111   111   111
 131   131   127   176   111
   1     1  [ 11]    1    76
 111   111     2   149   111
 111   111     2   149   152
```

### Assault on Giant Mountain, land 5, cell 2,3

Observed as west, mask 199. Center tile is wrapped in brackets.

```text
  25    98   140    10   111
  25   111   111    77   111
  25    76  [ 11]   12    13
  25   111     2   120    60
  25   111     2    98    60
```

## 19. Landlook 4 Forest Tile 129

- Priority: medium
- Evidence: 235 placement(s)
- Suggested role: single (52%)
- Human-approved role(s): none
- Legacy fallback role(s): west, capWest
- Review reasons: mixed-structural-roles
- Decision: pending

### Araman's Ring, land 1, cell 10,1

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 out   out   out   out   out
  24    24    24    24    24
 111   111  [129]  111   111
  97   111   111    97   111
 111   111   111   111   111
```

### Assault on Giant Mountain, land 4, cell 31,1

Observed as capSouth, mask 4. Center tile is wrapped in brackets.

```text
 out   out   out   out   out
  40    36    24    24    24
  40    25  [129]  111   111
  40    25   129   111   111
  40    25   129   111   111
```

### Assault on Giant Mountain, land 5, cell 5,7

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  98    60   111   111    60
 111    18     1    74    12
 126    60  [129]   91   152
 148    10   131   111   111
 137    10   145   111   111
```

## 20. Landlook 4 Mountains Tile 68

- Priority: high
- Evidence: 384 placement(s)
- Suggested role: single (24%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 28,1

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 out   out   out   out   out
  24    24    24    34    40
 111   111  [ 68]   38    40
 111   111   111    38    40
 111   111    98    38    40
```

### City of Bywater, land 4, cell 7,39

Observed as single, mask 64. Center tile is wrapped in brackets.

```text
  59    65   111    60   182
  38    25   111    60    72
  38    25  [ 68]   60    72
  59    65   111    16     1
  35    25   111   111   111
```

### City of Bywater, land 6, cell 69,16

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 111    91    91    91    91
  76    11     1     1     9
 111    10  [ 68]  111   111
 111    60   111   111   111
 111     2   111   111   111
```

## 21. Landlook 4 Water Tile 58

- Priority: high
- Evidence: 320 placement(s)
- Suggested role: center (28%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 69,26

Observed as northEast, mask 252. Center tile is wrapped in brackets.

```text
  72    36    29   111    38
  72    25    98   111    38
  72    25  [ 58]   97    38
  72    37    39    39    35
  72    40    40    40    40
```

### Assault on Giant Mountain, land 5, cell 15,4

Observed as north, mask 110. Center tile is wrapped in brackets.

```text
  41    24    24    24    41
  94    94    94    94    94
  39    28  [ 58]   39    39
  40    40    40    40    40
  40    40    40    40    40
```

### Assault on Giant Mountain, land 6, cell 4,13

Observed as center, mask 255. Center tile is wrapped in brackets.

```text
  40    40    25   111     2
  40    36    29   111     2
  40    42  [ 58]  111    77
  40    37    25   111     2
  40    40    42   111    16
```

## 22. Landlook 4 Forest Tile 122

- Priority: medium
- Evidence: 81 placement(s)
- Suggested role: single (53%)
- Human-approved role(s): none
- Legacy fallback role(s): southWest, notchSouthWest
- Review reasons: mixed-structural-roles
- Decision: pending

### City of Bywater, land 4, cell 1,64

Observed as capSouth, mask 4. Center tile is wrapped in brackets.

```text
 out    25   136   136     2
 out    33     1     1    12
 out    25  [122]  111   111
 out    25   122   111   111
 out    25   122   111   111
```

### City of Bywater, land 7, cell 30,52

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  40    40    40    40    40
  36    41    41    41    34
  25   111  [122]  107    38
  37    39    28   111    38
  40    40    25    91    38
```

### City of Port Hyrtin, land 8, cell 45,5

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  36    24    24    24    24
  25    95    95    95    80
  42    95  [122]   95    89
  25    95    95    95    89
  42    95   122    95    89
```

## 23. Landlook 4 Mountains Tile 61

- Priority: high
- Evidence: 2839 placement(s)
- Suggested role: lineHorizontal (33%)
- Human-approved role(s): none
- Legacy fallback role(s): center, single
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 4, cell 3,6

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 156   156   111    15     1
 157   157   111     2   140
   1     1  [ 61]   14   140
 156   156   151   151   111
 157   157   111   111   111
```

### Assault on Giant Mountain, land 5, cell 51,8

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  25   111   163   111    38
  42   152   164   123    38
  33     1  [ 61]    1    32
  43   141   142   143    38
  43   -200   -202   -204    59
```

### Assault on Giant Mountain, land 6, cell 58,5

Observed as capEast, mask 2. Center tile is wrapped in brackets.

```text
  40    25   138   138   138
  40    25   138   138   138
  40    33  [ 61]   61    61
  40    25   139   137   137
  40    25   139   137   137
```

## 24. Landlook 4 Water Tile 5

- Priority: high
- Evidence: 186 placement(s)
- Suggested role: northEast (29%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 73,50

Observed as east, mask 253. Center tile is wrapped in brackets.

```text
 111   103    99    99    99
 152   111   111   111   111
  39    39  [  5]   76     3
  40    40    25   111    38
  40    40    25   111    38
```

### Assault on Giant Mountain, land 5, cell 18,4

Observed as northEast, mask 76. Center tile is wrapped in brackets.

```text
  24    41    24    24    24
  94    94    94    94    94
  39    39  [  5]   76     3
  40    40    25    93    38
  40    40    42    94    38
```

### Assault on Giant Mountain, land 6, cell 19,13

Observed as northEast, mask 108. Center tile is wrapped in brackets.

```text
  41    66   144   161    93
 111    75   144   162    94
  39    27  [  5]   76     9
  40    40    25   111   111
  40    40    25   111   111
```

## 25. Landlook 4 Forest Tile 121

- Priority: medium
- Evidence: 13 placement(s)
- Suggested role: single (69%)
- Human-approved role(s): none
- Legacy fallback role(s): center, single
- Review reasons: confirmation
- Decision: pending

### City of Bywater, land 4, cell 9,18

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  38    36    24    34    40
  38    25   111    38    40
  38    25  [121]   38    40
  38    37    39    35    40
  31    24    24    34    40
```

### City of Port Hyrtin, land 8, cell 86,26

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 111   111    58     2   111
   1     1     1    17   111
 155   155  [121]    2    58
  39    39    39    27    39
  40    40    40    40    40
```

### Grilochs Revenge, land 8, cell 48,43

Observed as lineVertical, mask 5. Center tile is wrapped in brackets.

```text
  40    25   111   138   111
  40    25   126   111   111
  40    25  [121]  111   111
  40    25   121   111   111
  40    25   121   111   111
```

## 26. Landlook 4 Mountains Tile 92

- Priority: high
- Evidence: 80 placement(s)
- Suggested role: single (34%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 70,32

Observed as single, mask 16. Center tile is wrapped in brackets.

```text
  40    25   134     2   152
  40    42   111    77   111
  40    25  [ 92]    2   111
  40    37    39    49   111
  40    36    24     6    13
```

### Assault on Giant Mountain, land 5, cell 3,80

Observed as lineVertical, mask 5. Center tile is wrapped in brackets.

```text
  40    37    62    39    39
  40    36    64    41    41
  40    25  [ 92]  120    92
  40    25    92   111    92
  40    25    92   111    92
```

### City of Bywater, land 4, cell 17,20

Observed as capSouth, mask 4. Center tile is wrapped in brackets.

```text
  40    25   127   126   127
  40    25   111   -99   111
  40    42  [ 92]  111   111
  40    25    92   111   111
  40    25    92   111   111
```

## 27. Landlook 4 Water Tile 107

- Priority: high
- Evidence: 93 placement(s)
- Suggested role: single (30%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 76,45

Observed as southWest, mask 51. Center tile is wrapped in brackets.

```text
 111   111    91    31    24
 100   100   106   111   111
  73    73  [107]   30    39
 181    73    73    53    40
  73    73   108    31    24
```

### Assault on Giant Mountain, land 6, cell 65,7

Observed as southWest, mask 35. Center tile is wrapped in brackets.

```text
  20    95    95    95    95
  95    95   108    99   110
  95    95  [107]   21   109
  99    99    99    10    99
 180    15    76    19    76
```

### Begining of the End, land 2, cell 12,87

Observed as northEast, mask 236. Center tile is wrapped in brackets.

```text
 155     2   101   155   159
 155     2   101   155   162
 180     2  [107]  100   100
  39    27    39    39    39
  40    40    40    40    40
```

## 28. Landlook 4 Mountains Tile 93

- Priority: medium
- Evidence: 1306 placement(s)
- Suggested role: lineVertical (42%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 5, cell 11,1

Observed as northEast, mask 12. Center tile is wrapped in brackets.

```text
 out   out   out   out   out
  24    26    24    34    40
 111    77  [ 93]   38    40
 126     2    93    31    41
 158     2    93    94    94
```

### Assault on Giant Mountain, land 6, cell 21,5

Observed as single, mask 32. Center tile is wrapped in brackets.

```text
  40    40    40    40    40
  41    41    41    41    41
 144   158  [ 93]   94    93
 144   159    94    93    94
 144   161    93    94    93
```

### City of Bywater, land 6, cell 6,83

Observed as northWest, mask 38. Center tile is wrapped in brackets.

```text
  29   111    30    39    39
 111   152    31    41    24
 111   111  [ 93]   93    93
 111   111    93    93    93
 111   152    30    39    39
```

## 29. Landlook 4 Water Tile 109

- Priority: high
- Evidence: 81 placement(s)
- Suggested role: single (31%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Assault on Giant Mountain, land 6, cell 67,7

Observed as southEast, mask 73. Center tile is wrapped in brackets.

```text
  95    95    95    95    22
 108    99   110    95    95
 107    21  [109]   95    95
  99    10    99    99    99
  76    19    76    13   179
```

### Begining of the End, land 2, cell 16,87

Observed as capEast, mask 114. Center tile is wrapped in brackets.

```text
 159   155   102     2   155
 162   155   102     2   155
 100   100  [109]    2   155
  39    39    62    27    62
  40    40    96    96    96
```

### Castle in the Clouds, land 5, cell 16,27

Observed as capNorth, mask 1. Center tile is wrapped in brackets.

```text
  36    29   111   111   111
  25   117   105   100   100
  25   100  [109]   71    71
  54    71    71    71    71
  25    99   110    71    71
```

## 30. Landlook 4 Mountains Tile 86

- Priority: medium
- Evidence: 318 placement(s)
- Suggested role: center (44%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 66,42

Observed as center, mask 239. Center tile is wrapped in brackets.

```text
 142   143    31    24    34
  90    90    81   152    38
  78    78  [ 86]   81    38
  78    78    78    89    38
  78    78    78    89    47
```

### Assault on Giant Mountain, land 6, cell 43,16

Observed as south, mask 235. Center tile is wrapped in brackets.

```text
  29    87    31    34    40
  83    78    85    31    34
  84    78  [ 86]   85    31
  21    78    21    86    85
  45   111    46    78    78
```

### City of Bywater, land 4, cell 25,7

Observed as center, mask 255. Center tile is wrapped in brackets.

```text
  79    90    90    90    90
  88    78    80    82    78
  88    78  [ 86]   84    78
  85    87    87    87    87
 111   111   -99   111   111
```

## 31. Landlook 4 Water Tile 49

- Priority: high
- Evidence: 234 placement(s)
- Suggested role: northEast (33%)
- Human-approved role(s): none
- Legacy fallback role(s): notchSouthEast
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 71,33

Observed as center, mask 127. Center tile is wrapped in brackets.

```text
  42   111    77   111    48
  25    92     2   111    47
  37    39  [ 49]  111    23
  36    24     6    13   111
  25   131   130     2   111
```

### Assault on Giant Mountain, land 5, cell 24,4

Observed as northEast, mask 92. Center tile is wrapped in brackets.

```text
  24    24    66   111   111
  94    94    77   111   111
  39    39  [ 49]   97   111
  40    40    42    98    97
  40    40    37    39    39
```

### Assault on Giant Mountain, land 6, cell 8,8

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
 111   111    15     1    12
 111   111    60   152   126
  30    39  [ 49]  169   127
  38    40    43   170   127
  47    24     6     1    11
```

## 32. Landlook 4 Mountains Tile 82

- Priority: medium
- Evidence: 310 placement(s)
- Suggested role: center (45%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 64,45

Observed as center, mask 191. Center tile is wrapped in brackets.

```text
  88    78    78    78    78
  88    78    78    78    78
  85    87  [ 82]   78    78
 177   178    88    78    78
  79    90    84    78    78
```

### Assault on Giant Mountain, land 6, cell 40,19

Observed as east, mask 173. Center tile is wrapped in brackets.

```text
  29    83    84    21    78
  89    78    78    45   111
  28    81  [ 82]   16     9
  37    28    81    82    78
  40    37    28    81    78
```

### City of Bywater, land 4, cell 26,6

Observed as center, mask 255. Center tile is wrapped in brackets.

```text
  23    91    23   111   111
  90    90    90    90    81
  78    80  [ 82]   78    89
  78    86    84    78    89
  87    87    87    87    83
```

## 33. Landlook 4 Water Tile 1

- Priority: high
- Evidence: 6081 placement(s)
- Suggested role: lineHorizontal (33%)
- Human-approved role(s): none
- Legacy fallback role(s): northWest, capEast
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 61,27

Observed as south, mask 139. Center tile is wrapped in brackets.

```text
  72     8   111   111   111
  72     8   111   135   111
  72    16  [  1]    1     1
  72    72    72    72    72
  72    72    36    24    34
```

### Assault on Giant Mountain, land 4, cell 39,3

Observed as center, mask 191. Center tile is wrapped in brackets.

```text
 111   111   111   111   111
 111   111   111   111   111
 111    15  [  1]    1    13
 111    77   111   111     2
 111    60   158   126     2
```

### Assault on Giant Mountain, land 5, cell 5,6

Observed as southEast, mask 217. Center tile is wrapped in brackets.

```text
 120    60   111   111    10
  98    60   111   111    60
 111    18  [  1]   74    12
 126    60   129    91   152
 148    10   131   111   111
```

## 34. Landlook 4 Mountains Tile 80

- Priority: medium
- Evidence: 284 placement(s)
- Suggested role: center (51%)
- Human-approved role(s): none
- Legacy fallback role(s): west
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 66,50

Observed as center, mask 223. Center tile is wrapped in brackets.

```text
  78    78    78    89    48
  78    78    78    89    38
  78    78  [ 80]   83    38
  87    87    83   152    38
 142   143    30    39    35
```

### Assault on Giant Mountain, land 5, cell 6,76

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  83    84    78    16    76
  84    78    78   111   111
  78    78  [ 80]  105   100
  78    80    79   102    73
  39    39    39    39    62
```

### Assault on Giant Mountain, land 6, cell 44,19

Observed as west, mask 87. Center tile is wrapped in brackets.

```text
  78    21    86    85    31
 111    46    78    78    88
   9    14  [ 80]   79    30
  78    80    79    30    35
  78    79    30    35    40
```

## 35. Landlook 4 Water Tile 10

- Priority: high
- Evidence: 691 placement(s)
- Suggested role: lineVertical (33%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 73,30

Observed as west, mask 231. Center tile is wrapped in brackets.

```text
  40    25   176   111   111
  26     6    11    76     9
   2   152  [ 10]  111   111
  77   111    48    28   486
   2   111    47    29   111
```

### Assault on Giant Mountain, land 5, cell 3,1

Observed as southWest, mask 243. Center tile is wrapped in brackets.

```text
 out   out   out   out   out
  76    24    26    24    41
  98   140  [ 10]  111   111
 111   111    77   111   111
  76    11    12    13   111
```

### Assault on Giant Mountain, land 6, cell 65,2

Observed as center, mask 191. Center tile is wrapped in brackets.

```text
  41    24    26    76    26
 111   111     2   111     2
 111   111  [ 10]  111    10
 105   100    23   111    23
 102    95    95    95    95
```

## 36. Landlook 4 Mountains Tile 89

- Priority: medium
- Evidence: 1244 placement(s)
- Suggested role: east (47%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles
- Decision: pending

### Araman's Ring, land 1, cell 67,43

Observed as east, mask 205. Center tile is wrapped in brackets.

```text
  90    81   152    38    40
  78    86    81    38    40
  78    78  [ 89]   38    40
  78    78    89    47    34
  78    78    89    23    31
```

### Assault on Giant Mountain, land 5, cell 79,17

Observed as lineVertical, mask 133. Center tile is wrapped in brackets.

```text
 111    31    24    34    40
  79    90    81    38    40
  88    95  [ 89]   38    40
  88    95    89    38    40
  85    87    83    38    40
```

### Assault on Giant Mountain, land 6, cell 38,18

Observed as capEast, mask 50. Center tile is wrapped in brackets.

```text
  34    40    36    29    83
  31    26    29    83    84
 143    60  [ 89]   78    78
  30    27    28    81    82
  35    40    37    28    81
```

## 37. Landlook 4 Water Tile 6

- Priority: high
- Evidence: 183 placement(s)
- Suggested role: southEast (35%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 72,29

Observed as south, mask 235. Center tile is wrapped in brackets.

```text
  39    35    25   124   111
  40    40    25   176   111
  24    26  [  6]   11    76
 134     2   152    10   111
 111    77   111    48    28
```

### Assault on Giant Mountain, land 5, cell 18,11

Observed as northEast, mask 172. Center tile is wrapped in brackets.

```text
  40    40    42    93    38
  40    40   -192   -191   -190
  24    26  [  6]   76     4
 111    77   111   111   111
   1    17   111   152   111
```

### Assault on Giant Mountain, land 6, cell 8,10

Observed as center, mask 143. Center tile is wrapped in brackets.

```text
  30    39    49   169   127
  38    40    43   170   127
  47    24  [  6]    1    11
   2   152   111   152     2
   2   111   111   137    60
```

## 38. Landlook 4 Mountains Tile 66

- Priority: medium
- Evidence: 198 placement(s)
- Suggested role: capSouth (49%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles
- Decision: pending

### Assault on Giant Mountain, land 5, cell 24,2

Observed as capSouth, mask 4. Center tile is wrapped in brackets.

```text
  40    40    36    41    24
  40    40    42   152   111
  24    24  [ 66]  111   111
  94    94    77   111   111
  39    39    49    97   111
```

### Assault on Giant Mountain, land 6, cell 18,11

Observed as capSouth, mask 4. Center tile is wrapped in brackets.

```text
  40    40    25   144   159
  40    40    25   144   159
  24    41  [ 66]  144   161
 111   111    75   144   162
  39    39    27     5    76
```

### Castle in the Clouds, land 5, cell 33,45

Observed as single, mask 16. Center tile is wrapped in brackets.

```text
  40    40    25   111   111
  40    40    33    61    61
  24    24  [ 66]  111   111
 111   111     2   111    91
 111   111     2   111   111
```

## 39. Landlook 4 Water Tile 105

- Priority: high
- Evidence: 265 placement(s)
- Suggested role: lineHorizontal (35%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 72,44

Observed as southEast, mask 25. Center tile is wrapped in brackets.

```text
  36    24    41     6    76
  43   152   111   111   111
  43   111  [105]  100   100
  29   490   102    73    73
  91   111   102    73   181
```

### Assault on Giant Mountain, land 5, cell 75,7

Observed as southEast, mask 217. Center tile is wrapped in brackets.

```text
  40    40    40    40    40
  40    36    24    24    24
  40    25  [105]  100   106
  41    29   102    95   101
  93    93   102    95   101
```

### Assault on Giant Mountain, land 6, cell 63,3

Observed as southEast, mask 217. Center tile is wrapped in brackets.

```text
   2    98   111   111     2
   2   111   111   111    10
  10   111  [105]  100    23
  77   111   102    95    95
  19     1    20    95    95
```

## 40. Landlook 4 Mountains Tile 88

- Priority: medium
- Evidence: 1165 placement(s)
- Suggested role: west (51%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles
- Decision: pending

### Araman's Ring, land 1, cell 62,43

Observed as west, mask 55. Center tile is wrapped in brackets.

```text
  40    25   152    79    90
  40    43    79    84    78
  40    43  [ 88]   78    78
  40    43    88    78    78
  40    42    85    87    82
```

### Assault on Giant Mountain, land 5, cell 77,17

Observed as lineVertical, mask 21. Center tile is wrapped in brackets.

```text
 113   111   111    31    24
 116   111    79    90    81
 152   475  [ 88]   95    89
 475   176    88    95    89
  28   111    85    87    83
```

### Assault on Giant Mountain, land 6, cell 46,18

Observed as capWest, mask 200. Center tile is wrapped in brackets.

```text
  85    31    34    40    40
  86    85    31    34    40
  78    78  [ 88]   38    96
  80    79    30    35    40
  79    30    35    40    40
```

## 41. Landlook 4 Water Tile 106

- Priority: high
- Evidence: 97 placement(s)
- Suggested role: southWest (35%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 76,44

Observed as northWest, mask 182. Center tile is wrapped in brackets.

```text
  76     4    41    34    40
 111   111    91    31    24
 100   100  [106]  111   111
  73    73   107    30    39
 181    73    73    53    40
```

### Assault on Giant Mountain, land 5, cell 77,7

Observed as southWest, mask 179. Center tile is wrapped in brackets.

```text
  40    40    40    40    40
  24    24    24    34    40
 105   100  [106]   38    40
 102    95   101    38    40
 102    95   101    38    40
```

### Assault on Giant Mountain, land 6, cell 69,3

Observed as southWest, mask 179. Center tile is wrapped in brackets.

```text
   2   111   111    97     2
  10   111   111   111     2
  23   100  [106]  111    10
  95    95   101   111    75
  95    95    22     1    19
```

## 42. Landlook 4 Mountains Tile 72

- Priority: medium
- Evidence: 2456 placement(s)
- Suggested role: center (51%)
- Human-approved role(s): none
- Legacy fallback role(s): southWest, notchSouthWest
- Review reasons: mixed-structural-roles
- Decision: pending

### Araman's Ring, land 1, cell 59,17

Observed as northWest, mask 38. Center tile is wrapped in brackets.

```text
 111   111   111   111   111
 111   111   111   111   111
 111   111  [ 72]   72    72
 111   111    72    72    73
  72    72    72    72    72
```

### City of Bywater, land 4, cell 10,36

Observed as capWest, mask 136. Center tile is wrapped in brackets.

```text
  40    96    40    40    40
  26    64    51    24    24
  60    70  [ 72]  182    72
  60   182   182   182    72
  60    72    72   182    72
```

### City of Bywater, land 7, cell 1,31

Observed as northWest, mask 38. Center tile is wrapped in brackets.

```text
 out    25   111   175   111
 out    25   107   100   106
 out    50  [ 72]   72   107
 out    50    72    72    72
 out    50    72    72    72
```

## 43. Landlook 4 Water Tile 3

- Priority: high
- Evidence: 193 placement(s)
- Suggested role: northWest (35%)
- Human-approved role(s): none
- Legacy fallback role(s): north, capSouth
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 75,50

Observed as west, mask 247. Center tile is wrapped in brackets.

```text
  99    99    99   104   111
 111   111   111   111    30
   5    76  [  3]   39    35
  25   111    38    40    40
  25   111    38    40    40
```

### Assault on Giant Mountain, land 4, cell 40,32

Observed as center, mask 255. Center tile is wrapped in brackets.

```text
 111     2   111    16    76
 111     2   111   111   111
 111    16  [  3]   39    39
 111   111    38    40    40
 111   111    38    40    40
```

### Assault on Giant Mountain, land 5, cell 20,4

Observed as northWest, mask 38. Center tile is wrapped in brackets.

```text
  24    24    24    41    24
  94    94    94    94    94
   5    76  [  3]   39    39
  25    93    38    40    40
  42    94    38    40    40
```

## 44. Landlook 4 Mountains Tile 90

- Priority: medium
- Evidence: 1145 placement(s)
- Suggested role: north (51%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles
- Decision: pending

### Araman's Ring, land 1, cell 64,41

Observed as north, mask 110. Center tile is wrapped in brackets.

```text
  40    36    41    41    34
  24    29   142   143    31
 152    79  [ 90]   90    81
  79    84    78    78    86
  88    78    78    78    78
```

### Assault on Giant Mountain, land 5, cell 78,16

Observed as lineHorizontal, mask 106. Center tile is wrapped in brackets.

```text
  76     9    32    40    40
 111   111    31    24    34
 111    79  [ 90]   81    38
 475    88    95    89    38
 176    88    95    89    38
```

### Assault on Giant Mountain, land 6, cell 42,22

Observed as lineVertical, mask 149. Center tile is wrapped in brackets.

```text
  81    82    78    80    79
  28    81    78    79    30
  37    28  [ 90]   30    35
  40    33    76    32    40
  36    29   111    31    34
```

## 45. Landlook 4 Water Tile 9

- Priority: high
- Evidence: 551 placement(s)
- Suggested role: lineHorizontal (35%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 75,29

Observed as west, mask 247. Center tile is wrapped in brackets.

```text
 124   111   111    38    40
 176   111   111    38    40
  11    76  [  9]   19    24
  10   111   111     2   111
  48    28   486    77   111
```

### Assault on Giant Mountain, land 5, cell 8,6

Observed as northEast, mask 172. Center tile is wrapped in brackets.

```text
 111    10   111   162    48
 111    60   152   127    38
  74    12  [  9]   76    32
  91   152   111   111    38
 111   111   111   111    38
```

### Assault on Giant Mountain, land 6, cell 21,13

Observed as northWest, mask 102. Center tile is wrapped in brackets.

```text
 144   161    93    94    93
 144   162    94    93    94
   5    76  [  9]   11     1
  25   111   111     2   111
  25   111   111    75   111
```

## 46. Landlook 4 Mountains Tile 62

- Priority: medium
- Evidence: 608 placement(s)
- Suggested role: single (52%)
- Human-approved role(s): none
- Legacy fallback role(s): east, lineVertical
- Review reasons: mixed-structural-roles
- Decision: pending

### Assault on Giant Mountain, land 5, cell 17,70

Observed as capSouth, mask 4. Center tile is wrapped in brackets.

```text
  42   -218   -217   -218   -217
  25   -219   -216   -219   -216
  37    39  [ 62]   39    39
  26    24    64    41    24
   2   142   143   152   152
```

### Assault on Giant Mountain, land 6, cell 75,11

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 136   136   111   137   138
  39    28   111   138   138
  40    37  [ 62]   39    39
  40    40    96    40    40
  41    41    64    34    40
```

### Begining of the End, land 2, cell 16,88

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 162   155   102     2   155
 100   100   109     2   155
  39    39  [ 62]   27    62
  40    40    96    96    96
 out   out   out   out   out
```

## 47. Landlook 4 Water Tile 23

- Priority: high
- Evidence: 96 placement(s)
- Suggested role: capNorth (35%)
- Human-approved role(s): none
- Legacy fallback role(s): none
- Review reasons: mixed-structural-roles, many-neighbor-shapes
- Decision: pending

### Araman's Ring, land 1, cell 73,33

Observed as center, mask 255. Center tile is wrapped in brackets.

```text
  77   111    48    28   486
   2   111    47    29   111
  49   111  [ 23]  111    30
   6    13   111   111    47
 130     2   111   111     2
```

### Assault on Giant Mountain, land 6, cell 65,3

Observed as southWest, mask 147. Center tile is wrapped in brackets.

```text
 111   111     2   111     2
 111   111    10   111    10
 105   100  [ 23]  111    23
 102    95    95    95    95
  20    95    95    95    95
```

### Castle in the Clouds, land 5, cell 7,63

Observed as center, mask 111. Center tile is wrapped in brackets.

```text
 178   111   111   111   111
 499   481    15    61    61
 143   111  [ 23]  111   111
 111   111   111   111   111
 111   111   111   111   111
```

## 48. Landlook 4 Mountains Tile 64

- Priority: medium
- Evidence: 558 placement(s)
- Suggested role: single (53%)
- Human-approved role(s): none
- Legacy fallback role(s): southEast
- Review reasons: mixed-structural-roles
- Decision: pending

### Assault on Giant Mountain, land 5, cell 17,71

Observed as capNorth, mask 1. Center tile is wrapped in brackets.

```text
  25   -219   -216   -219   -216
  37    39    62    39    39
  26    24  [ 64]   41    24
   2   142   143   152   152
  75   111    95    78    95
```

### Assault on Giant Mountain, land 6, cell 75,13

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
  40    37    62    39    39
  40    40    96    40    40
  41    41  [ 64]   34    40
 111   111   173    31    34
 111   111   111   140    38
```

### City of Bywater, land 4, cell 7,35

Observed as single, mask 0. Center tile is wrapped in brackets.

```text
 111    59    96    40    96
  39    35    96    40    96
  34    36  [ 64]   26    64
  38    25   111    60    70
  59    65   111    60   182
```

