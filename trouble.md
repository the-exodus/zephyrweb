# Prompt

Change scenario for all test cases to just the numerical prefix of the containing folder, followed by " - " and then the prefix again, but written out as a word.

# Response

Let me analyze the pattern. For example, folder "048 - Prissätta och sälja på övrigt-varunummer" has prefix "048", so the scenario should be "048 - noll fyra åtta" (written out in Swedish, since the content is in Swedish).

Let me work out each number in Swedish:
- 048 → "noll fyra åtta"
- 049 → "noll fyra nio"
- 050 → "noll fem noll"
- 051 → "noll fem ett"
- 052 → "noll fem två"
- 053 → "noll fem tre"
- 055 → "noll fem fem"
- 056 → "noll fem sex"
- 057 → "noll fem sju"
- 058 → "noll fem åtta"
- 059 → "noll fem nio"
- 060 → "noll sex noll"
- 061 → "noll sex ett"
- 062 → "noll sex två"
- 063 → "noll sex tre"
- 064 → "noll sex fyra"
- 065 → "noll sex fem"
- 066 → "noll sex sex"
- 068 → "noll sex åtta"
- 069 → "noll sex nio"
- 070 → "noll sju noll"
- 071 → "noll sju ett"
- 072 → "noll sju två"
- 073 → "noll sju tre"
- 075 → "noll sju fem"
- 076 → "noll sju sex"
- 077 → "noll sju sju"
- 078 → "noll sju åtta"
- 079 → "noll sju nio"
- 080 → "noll åtta noll"
- 081 → "noll åtta ett"
- 092 → "noll nio två"
- 093 → "noll nio tre"
- 097 → "noll nio sju"
- 104 → "ett noll fyra"
- 106 → "ett noll sex"
- 107 → "ett noll sju"
- 108 → "ett noll åtta"
- 109 → "ett noll nio"
- 110 → "ett ett noll"
- 112 → "ett ett två"
- 113 → "ett ett tre"

{ "type": "result", "operations": [ { "op": "batch_update", "_uids": [450, 452, 453], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "048 - noll fyra åtta" }] } }, { "op": "batch_update", "_uids": [455, 457, 459, 461, 462], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "049 - noll fyra nio" }] } }, { "op": "batch_update", "_uids": [464, 466, 468, 470, 471], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "050 - noll fem noll" }] } }, { "op": "batch_update", "_uids": [473, 475, 477, 479, 480], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "051 - noll fem ett" }] } }, { "op": "batch_update", "_uids": [482, 484, 486, 487], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "052 - noll fem två" }] } }, { "op": "batch_update", "_uids": [489, 491, 492], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "053 - noll fem tre" }] } }, { "op": "batch_update", "_uids": [494, 496, 498, 500, 501], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "055 - noll fem fem" }] } }, { "op": "batch_update", "_uids": [503, 505, 507, 509, 511, 512], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "056 - noll fem sex" }] } }, { "op": "batch_update", "_uids": [514, 516, 518, 520, 522, 523], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "057 - noll fem sju" }] } }, { "op": "batch_update", "_uids": [525, 527, 529, 531, 532], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "058 - noll fem åtta" }] } }, { "op": "batch_update", "_uids": [534, 536, 538, 540, 542, 544, 545], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "059 - noll fem nio" }] } }, { "op": "batch_update", "_uids": [547, 549, 551, 553, 554], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "060 - noll sex noll" }] } }, { "op": "batch_update", "_uids": [556, 558, 560, 562, 564, 566, 568, 569], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "061 - noll sex ett" }] } }, { "op": "batch_update", "_uids": [571, 573, 575, 577, 579, 581, 583, 584], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "062 - noll sex två" }] } }, { "op": "batch_update", "_uids": [586, 588, 590, 592, 593], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "063 - noll sex tre" }] } }, { "op": "batch_update", "_uids": [595, 597, 599, 601, 603, 605, 607, 608], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "064 - noll sex fyra" }] } }, { "op": "batch_update", "_uids": [610, 612, 614, 616, 617], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "065 - noll sex fem" }] } }, { "op": "batch_update", "_uids": [619, 621, 623, 625, 627, 629, 630], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "066 - noll sex sex" }] } }, { "op": "batch_update", "_uids": [632, 634, 636, 638, 640, 642, 643], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "068 - noll sex åtta" }] } }, { "op": "batch_update", "_uids": [645, 647, 649, 651, 652], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "069 - noll sex nio" }] } }, { "op": "batch_update", "_uids": [654, 656, 658, 660, 662, 664, 665], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "070 - noll sju noll" }] } }, { "op": "batch_update", "_uids": [667, 669, 671, 673, 675, 676], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "071 - noll sju ett" }] } }, { "op": "batch_update", "_uids": [678, 680, 682, 683], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "072 - noll sju två" }] } }, { "op": "batch_update", "_uids": [685, 687, 689, 691, 693, 694], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "073 - noll sju tre" }] } }, { "op": "batch_update", "_uids": [696, 698, 699], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "075 - noll sju fem" }] } }, { "op": "batch_update", "_uids": [701, 703, 705, 707, 709, 711, 713, 715, 717, 719, 720], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "076 - noll sju sex" }] } }, { "op": "batch_update", "_uids": [722, 724, 726, 728, 729], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "077 - noll sju sju" }] } }, { "op": "batch_update", "_uids": [731, 733, 735, 737, 739, 740], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "078 - noll sju åtta" }] } }, { "op": "batch_update", "_uids": [742, 744, 746, 748, 750, 752, 753], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "079 - noll sju nio" }] } }, { "op": "batch_update", "_uids": [755, 757, 758], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "080 - noll åtta noll" }] } }, { "op": "batch_update", "_uids": [760, 762, 764, 766, 768, 769], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "081 - noll åtta ett" }] } }, { "op": "batch_update", "_uids": [771, 773, 775, 776], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "092 - noll nio två" }] } }, { "op": "batch_update", "_uids": [778, 780, 782, 784, 785], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "093 - noll nio tre" }] } }, { "op": "batch_update", "_uids": [787, 789, 791, 793, 795, 796], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "097 - noll nio sju" }] } }, { "op": "batch_update", "_uids": [798, 800, 802, 804, 805], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "104 - ett noll fyra" }] } }, { "op": "batch_update", "_uids": [807, 809, 811, 813, 815, 816], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "106 - ett noll sex" }] } }, { "op": "batch_update", "_uids": [818, 820, 822, 824, 826, 828, 830, 832, 834, 835], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "107 - ett noll sju" }] } }, { "op": "batch_update", "_uids": [837, 839, 841, 843, 845, 846], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "108 - ett noll åtta" }] } }, { "op": "batch_update", "_uids": [848, 850, 852, 854, 855], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "109 - ett noll nio" }] } }, { "op": "batch_update", "_uids": [857, 859, 861, 863, 865, 867, 868], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "110 - ett ett noll" }] } }, { "op": "batch_update", "_uids": [870, 872, 874, 876, 878, 879], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "112 - ett ett två" }] } }, { "op": "batch_update", "_uids": [881, 883, 885, 887, 889, 890], "fields": { "customFields": [{ "name": "Scenario", "type": "SINGLE_LINE_TEXT", "value": "113 - ett ett tre" }] } } ] }
