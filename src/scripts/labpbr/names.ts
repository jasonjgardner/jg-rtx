/**
 * Java Edition texture names and their Bedrock sources.
 *
 * Generated from the table in `java-convert.ts` so the two never drift by a typo.
 * Names absent from this table are identical in both editions.
 */

/** Java texture base name to Bedrock texture base name. */
export const JAVA_TO_BEDROCK: Readonly<Record<string, string>> = {

  // Anvil variations
  anvil: "anvil_base",
  anvil_top: "anvil_top_damaged_0",
  chipped_anvil_top: "anvil_top_damaged_1",
  damaged_anvil_top: "anvil_top_damaged_2",

  // Bricks
  bricks: "brick",

  // Furnace/Blast furnace
  blast_furnace_front: "blast_furnace_front_off",

  // Beetroots stages
  beetroots_stage0: "beetroots_stage_0",
  beetroots_stage1: "beetroots_stage_1",
  beetroots_stage2: "beetroots_stage_2",
  beetroots_stage3: "beetroots_stage_3",

  // Big dripleaf
  big_dripleaf_side: "big_dripleaf_side1",

  // Bamboo leaves variations
  bamboo_large_leaves: "bamboo_leaf",
  bamboo_small_leaves: "bamboo_small_leaf",
  bamboo_singleleaf: "bamboo_singleleaf",

  // Bamboo stage
  bamboo_stage0: "bamboo_sapling",
  bamboo_stalk: "bamboo_stem",

  // Short grass
  short_grass: "tallgrass",

  // Tall grass
  tall_grass_bottom: "double_plant_grass_bottom",
  tall_grass_top: "double_plant_grass_top",

  // Fern
  fern: "fern",
  large_fern_bottom: "double_plant_fern_bottom",
  large_fern_top: "double_plant_fern_top",

  // Flowers
  dandelion: "flower_dandelion",
  poppy: "flower_rose",
  blue_orchid: "flower_blue_orchid",
  allium: "flower_allium",
  azure_bluet: "flower_houstonia",
  red_tulip: "flower_tulip_red",
  orange_tulip: "flower_tulip_orange",
  white_tulip: "flower_tulip_white",
  pink_tulip: "flower_tulip_pink",
  oxeye_daisy: "flower_oxeye_daisy",
  cornflower: "flower_cornflower",
  lily_of_the_valley: "flower_lily_of_the_valley",
  wither_rose: "flower_wither_rose",

  // Double flowers
  sunflower_front: "double_plant_sunflower_front",
  sunflower_back: "double_plant_sunflower_back",
  sunflower_bottom: "double_plant_sunflower_bottom",
  sunflower_top: "double_plant_sunflower_top",
  lilac_bottom: "double_plant_syringa_bottom",
  lilac_top: "double_plant_syringa_top",
  rose_bush_bottom: "double_plant_rose_bottom",
  rose_bush_top: "double_plant_rose_top",
  peony_bottom: "double_plant_paeonia_bottom",
  peony_top: "double_plant_paeonia_top",

  // Mushrooms
  brown_mushroom: "mushroom_brown",
  red_mushroom: "mushroom_red",

  // Saplings
  oak_sapling: "sapling_oak",
  spruce_sapling: "sapling_spruce",
  birch_sapling: "sapling_birch",
  jungle_sapling: "sapling_jungle",
  acacia_sapling: "sapling_acacia",
  dark_oak_sapling: "sapling_roofed_oak",

  // Logs
  oak_log: "log_oak",
  spruce_log: "log_spruce",
  birch_log: "log_birch",
  jungle_log: "log_jungle",
  oak_log_top: "log_oak_top",
  spruce_log_top: "log_spruce_top",
  birch_log_top: "log_birch_top",
  jungle_log_top: "log_jungle_top",
  acacia_log: "log_acacia",
  dark_oak_log: "log_big_oak",
  acacia_log_top: "log_acacia_top",
  dark_oak_log_top: "log_big_oak_top",

  // Stripped logs
  stripped_oak_log: "stripped_oak_log",
  stripped_spruce_log: "stripped_spruce_log",
  stripped_birch_log: "stripped_birch_log",
  stripped_jungle_log: "stripped_jungle_log",
  stripped_acacia_log: "stripped_acacia_log",
  stripped_dark_oak_log: "stripped_dark_oak_log",
  stripped_oak_log_top: "stripped_oak_log_top",
  stripped_spruce_log_top: "stripped_spruce_log_top",
  stripped_birch_log_top: "stripped_birch_log_top",
  stripped_jungle_log_top: "stripped_jungle_log_top",
  stripped_acacia_log_top: "stripped_acacia_log_top",
  stripped_dark_oak_log_top: "stripped_dark_oak_log_top",

  // Planks
  oak_planks: "planks_oak",
  spruce_planks: "planks_spruce",
  birch_planks: "planks_birch",
  jungle_planks: "planks_jungle",
  acacia_planks: "planks_acacia",
  dark_oak_planks: "planks_big_oak",

  // Leaves
  oak_leaves: "leaves_oak",
  spruce_leaves: "leaves_spruce",
  birch_leaves: "leaves_birch",
  jungle_leaves: "leaves_jungle",
  acacia_leaves: "leaves_acacia",
  dark_oak_leaves: "leaves_big_oak",
  azalea_leaves: "azalea_leaves",
  flowering_azalea_leaves: "azalea_leaves_flowers",

  // Doors
  oak_door_bottom: "door_wood_lower",
  oak_door_top: "door_wood_upper",
  iron_door_bottom: "door_iron_lower",
  iron_door_top: "door_iron_upper",
  spruce_door_bottom: "door_spruce_lower",
  spruce_door_top: "door_spruce_upper",
  birch_door_bottom: "door_birch_lower",
  birch_door_top: "door_birch_upper",
  jungle_door_bottom: "door_jungle_lower",
  jungle_door_top: "door_jungle_upper",
  acacia_door_bottom: "door_acacia_lower",
  acacia_door_top: "door_acacia_upper",
  dark_oak_door_bottom: "door_dark_oak_lower",
  dark_oak_door_top: "door_dark_oak_upper",

  // Trapdoors
  oak_trapdoor: "trapdoor",

  // Wool colors
  white_wool: "wool_colored_white",
  orange_wool: "wool_colored_orange",
  magenta_wool: "wool_colored_magenta",
  light_blue_wool: "wool_colored_light_blue",
  yellow_wool: "wool_colored_yellow",
  lime_wool: "wool_colored_lime",
  pink_wool: "wool_colored_pink",
  gray_wool: "wool_colored_gray",
  light_gray_wool: "wool_colored_silver",
  cyan_wool: "wool_colored_cyan",
  purple_wool: "wool_colored_purple",
  blue_wool: "wool_colored_blue",
  brown_wool: "wool_colored_brown",
  green_wool: "wool_colored_green",
  red_wool: "wool_colored_red",
  black_wool: "wool_colored_black",

  // Concrete
  white_concrete: "concrete_white",
  orange_concrete: "concrete_orange",
  magenta_concrete: "concrete_magenta",
  light_blue_concrete: "concrete_light_blue",
  yellow_concrete: "concrete_yellow",
  lime_concrete: "concrete_lime",
  pink_concrete: "concrete_pink",
  gray_concrete: "concrete_gray",
  light_gray_concrete: "concrete_silver",
  cyan_concrete: "concrete_cyan",
  purple_concrete: "concrete_purple",
  blue_concrete: "concrete_blue",
  brown_concrete: "concrete_brown",
  green_concrete: "concrete_green",
  red_concrete: "concrete_red",
  black_concrete: "concrete_black",

  // Concrete powder
  white_concrete_powder: "concrete_powder_white",
  orange_concrete_powder: "concrete_powder_orange",
  magenta_concrete_powder: "concrete_powder_magenta",
  light_blue_concrete_powder: "concrete_powder_light_blue",
  yellow_concrete_powder: "concrete_powder_yellow",
  lime_concrete_powder: "concrete_powder_lime",
  pink_concrete_powder: "concrete_powder_pink",
  gray_concrete_powder: "concrete_powder_gray",
  light_gray_concrete_powder: "concrete_powder_silver",
  cyan_concrete_powder: "concrete_powder_cyan",
  purple_concrete_powder: "concrete_powder_purple",
  blue_concrete_powder: "concrete_powder_blue",
  brown_concrete_powder: "concrete_powder_brown",
  green_concrete_powder: "concrete_powder_green",
  red_concrete_powder: "concrete_powder_red",
  black_concrete_powder: "concrete_powder_black",

  // Terracotta
  terracotta: "hardened_clay",
  white_terracotta: "hardened_clay_stained_white",
  orange_terracotta: "hardened_clay_stained_orange",
  magenta_terracotta: "hardened_clay_stained_magenta",
  light_blue_terracotta: "hardened_clay_stained_light_blue",
  yellow_terracotta: "hardened_clay_stained_yellow",
  lime_terracotta: "hardened_clay_stained_lime",
  pink_terracotta: "hardened_clay_stained_pink",
  gray_terracotta: "hardened_clay_stained_gray",
  light_gray_terracotta: "hardened_clay_stained_silver",
  cyan_terracotta: "hardened_clay_stained_cyan",
  purple_terracotta: "hardened_clay_stained_purple",
  blue_terracotta: "hardened_clay_stained_blue",
  brown_terracotta: "hardened_clay_stained_brown",
  green_terracotta: "hardened_clay_stained_green",
  red_terracotta: "hardened_clay_stained_red",
  black_terracotta: "hardened_clay_stained_black",

  // Glazed terracotta
  white_glazed_terracotta: "glazed_terracotta_white",
  orange_glazed_terracotta: "glazed_terracotta_orange",
  magenta_glazed_terracotta: "glazed_terracotta_magenta",
  light_blue_glazed_terracotta: "glazed_terracotta_light_blue",
  yellow_glazed_terracotta: "glazed_terracotta_yellow",
  lime_glazed_terracotta: "glazed_terracotta_lime",
  pink_glazed_terracotta: "glazed_terracotta_pink",
  gray_glazed_terracotta: "glazed_terracotta_gray",
  light_gray_glazed_terracotta: "glazed_terracotta_silver",
  cyan_glazed_terracotta: "glazed_terracotta_cyan",
  purple_glazed_terracotta: "glazed_terracotta_purple",
  blue_glazed_terracotta: "glazed_terracotta_blue",
  brown_glazed_terracotta: "glazed_terracotta_brown",
  green_glazed_terracotta: "glazed_terracotta_green",
  red_glazed_terracotta: "glazed_terracotta_red",
  black_glazed_terracotta: "glazed_terracotta_black",

  // Stained glass
  white_stained_glass: "glass_white",
  orange_stained_glass: "glass_orange",
  magenta_stained_glass: "glass_magenta",
  light_blue_stained_glass: "glass_light_blue",
  yellow_stained_glass: "glass_yellow",
  lime_stained_glass: "glass_lime",
  pink_stained_glass: "glass_pink",
  gray_stained_glass: "glass_gray",
  light_gray_stained_glass: "glass_silver",
  cyan_stained_glass: "glass_cyan",
  purple_stained_glass: "glass_purple",
  blue_stained_glass: "glass_blue",
  brown_stained_glass: "glass_brown",
  green_stained_glass: "glass_green",
  red_stained_glass: "glass_red",
  black_stained_glass: "glass_black",

  // Stained glass pane tops
  white_stained_glass_pane_top: "glass_pane_top_white",
  orange_stained_glass_pane_top: "glass_pane_top_orange",
  magenta_stained_glass_pane_top: "glass_pane_top_magenta",
  light_blue_stained_glass_pane_top: "glass_pane_top_light_blue",
  yellow_stained_glass_pane_top: "glass_pane_top_yellow",
  lime_stained_glass_pane_top: "glass_pane_top_lime",
  pink_stained_glass_pane_top: "glass_pane_top_pink",
  gray_stained_glass_pane_top: "glass_pane_top_gray",
  light_gray_stained_glass_pane_top: "glass_pane_top_silver",
  cyan_stained_glass_pane_top: "glass_pane_top_cyan",
  purple_stained_glass_pane_top: "glass_pane_top_purple",
  blue_stained_glass_pane_top: "glass_pane_top_blue",
  brown_stained_glass_pane_top: "glass_pane_top_brown",
  green_stained_glass_pane_top: "glass_pane_top_green",
  red_stained_glass_pane_top: "glass_pane_top_red",
  black_stained_glass_pane_top: "glass_pane_top_black",

  // Shulker boxes
  shulker_box: "shulker_top_undyed",
  white_shulker_box: "shulker_top_white",
  orange_shulker_box: "shulker_top_orange",
  magenta_shulker_box: "shulker_top_magenta",
  light_blue_shulker_box: "shulker_top_light_blue",
  yellow_shulker_box: "shulker_top_yellow",
  lime_shulker_box: "shulker_top_lime",
  pink_shulker_box: "shulker_top_pink",
  gray_shulker_box: "shulker_top_gray",
  light_gray_shulker_box: "shulker_top_silver",
  cyan_shulker_box: "shulker_top_cyan",
  purple_shulker_box: "shulker_top_purple",
  blue_shulker_box: "shulker_top_blue",
  brown_shulker_box: "shulker_top_brown",
  green_shulker_box: "shulker_top_green",
  red_shulker_box: "shulker_top_red",
  black_shulker_box: "shulker_top_black",

  // Candles
  candle: "candle",
  candle_lit: "candle_lit",
  white_candle: "candle_white",
  white_candle_lit: "candle_white_lit",
  orange_candle: "candle_orange",
  orange_candle_lit: "candle_orange_lit",
  magenta_candle: "candle_magenta",
  magenta_candle_lit: "candle_magenta_lit",
  light_blue_candle: "candle_light_blue",
  light_blue_candle_lit: "candle_light_blue_lit",
  yellow_candle: "candle_yellow",
  yellow_candle_lit: "candle_yellow_lit",
  lime_candle: "candle_lime",
  lime_candle_lit: "candle_lime_lit",
  pink_candle: "candle_pink",
  pink_candle_lit: "candle_pink_lit",
  gray_candle: "candle_gray",
  gray_candle_lit: "candle_gray_lit",
  light_gray_candle: "candle_silver",
  light_gray_candle_lit: "candle_silver_lit",
  cyan_candle: "candle_cyan",
  cyan_candle_lit: "candle_cyan_lit",
  purple_candle: "candle_purple",
  purple_candle_lit: "candle_purple_lit",
  blue_candle: "candle_blue",
  blue_candle_lit: "candle_blue_lit",
  brown_candle: "candle_brown",
  brown_candle_lit: "candle_brown_lit",
  green_candle: "candle_green",
  green_candle_lit: "candle_green_lit",
  red_candle: "candle_red",
  red_candle_lit: "candle_red_lit",
  black_candle: "candle_black",
  black_candle_lit: "candle_black_lit",

  // Stone variants
  stone: "stone",
  granite: "stone_granite",
  polished_granite: "stone_granite_smooth",
  diorite: "stone_diorite",
  polished_diorite: "stone_diorite_smooth",
  andesite: "stone_andesite",
  polished_andesite: "stone_andesite_smooth",

  // Sandstone
  sandstone: "sandstone_normal",
  sandstone_top: "sandstone_top",
  sandstone_bottom: "sandstone_bottom",
  chiseled_sandstone: "sandstone_carved",
  cut_sandstone: "sandstone_smooth",
  red_sandstone: "red_sandstone_normal",
  red_sandstone_top: "red_sandstone_top",
  red_sandstone_bottom: "red_sandstone_bottom",
  chiseled_red_sandstone: "red_sandstone_carved",
  cut_red_sandstone: "red_sandstone_smooth",

  // Quartz
  quartz_block_top: "quartz_block_top",
  quartz_block_side: "quartz_block_side",
  quartz_block_bottom: "quartz_block_bottom",
  chiseled_quartz_block: "quartz_block_chiseled",
  chiseled_quartz_block_top: "quartz_block_chiseled_top",
  quartz_pillar: "quartz_block_lines",
  quartz_pillar_top: "quartz_block_lines_top",

  // Prismarine
  prismarine: "prismarine_rough",
  prismarine_bricks: "prismarine_bricks",
  dark_prismarine: "prismarine_dark",

  // Nether blocks
  netherrack: "netherrack",
  nether_bricks: "nether_brick",
  red_nether_bricks: "red_nether_brick",
  chiseled_nether_bricks: "chiseled_nether_bricks",
  cracked_nether_bricks: "cracked_nether_bricks",

  // End blocks
  end_stone: "end_stone",
  end_stone_bricks: "end_bricks",

  // Purpur
  purpur_block: "purpur_block",
  purpur_pillar: "purpur_pillar",
  purpur_pillar_top: "purpur_pillar_top",

  // Misc blocks
  cobblestone: "cobblestone",
  mossy_cobblestone: "cobblestone_mossy",
  stone_bricks: "stonebrick",
  mossy_stone_bricks: "stonebrick_mossy",
  cracked_stone_bricks: "stonebrick_cracked",
  chiseled_stone_bricks: "stonebrick_carved",
  smooth_stone: "stone_slab_top",
  smooth_stone_slab_side: "stone_slab_side",

  // Ores
  coal_ore: "coal_ore",
  iron_ore: "iron_ore",
  gold_ore: "gold_ore",
  diamond_ore: "diamond_ore",
  emerald_ore: "emerald_ore",
  lapis_ore: "lapis_ore",
  redstone_ore: "redstone_ore",

  // Deepslate ores
  deepslate_coal_ore: "deepslate_coal_ore",
  deepslate_iron_ore: "deepslate_iron_ore",
  deepslate_gold_ore: "deepslate_gold_ore",
  deepslate_diamond_ore: "deepslate_diamond_ore",
  deepslate_emerald_ore: "deepslate_emerald_ore",
  deepslate_lapis_ore: "deepslate_lapis_ore",
  deepslate_redstone_ore: "deepslate_redstone_ore",
  deepslate_copper_ore: "deepslate_copper_ore",

  // Metal blocks
  iron_block: "iron_block",
  gold_block: "gold_block",
  diamond_block: "diamond_block",
  emerald_block: "emerald_block",
  lapis_block: "lapis_block",
  coal_block: "coal_block",
  redstone_block: "redstone_block",

  // Redstone components
  redstone_torch: "redstone_torch_on",
  redstone_torch_off: "redstone_torch_off",
  redstone_lamp: "redstone_lamp_off",
  redstone_lamp_on: "redstone_lamp_on",
  repeater: "repeater_off",
  repeater_on: "repeater_on",
  comparator: "comparator_off",
  comparator_on: "comparator_on",

  // Rails
  rail: "rail_normal",
  rail_corner: "rail_normal_turned",
  powered_rail: "rail_golden",
  powered_rail_on: "rail_golden_powered",
  detector_rail: "rail_detector",
  detector_rail_on: "rail_detector_powered",
  activator_rail: "rail_activator",
  activator_rail_on: "rail_activator_powered",

  // Piston
  piston_top: "piston_top_normal",
  piston_top_sticky: "piston_top_sticky",
  piston_side: "piston_side",
  piston_bottom: "piston_bottom",
  piston_inner: "piston_inner",

  // Observer
  observer_back: "observer_back",
  observer_back_on: "observer_back_lit",
  observer_front: "observer_front",
  observer_side: "observer_side",
  observer_top: "observer_top",

  // TNT
  tnt_side: "tnt_side",
  tnt_top: "tnt_top",
  tnt_bottom: "tnt_bottom",

  // Crops
  wheat_stage0: "wheat_stage_0",
  wheat_stage1: "wheat_stage_1",
  wheat_stage2: "wheat_stage_2",
  wheat_stage3: "wheat_stage_3",
  wheat_stage4: "wheat_stage_4",
  wheat_stage5: "wheat_stage_5",
  wheat_stage6: "wheat_stage_6",
  wheat_stage7: "wheat_stage_7",
  carrots_stage0: "carrots_stage_0",
  carrots_stage1: "carrots_stage_1",
  carrots_stage2: "carrots_stage_2",
  carrots_stage3: "carrots_stage_3",
  potatoes_stage0: "potatoes_stage_0",
  potatoes_stage1: "potatoes_stage_1",
  potatoes_stage2: "potatoes_stage_2",
  potatoes_stage3: "potatoes_stage_3",
  melon_stem: "melon_stem_disconnected",
  attached_melon_stem: "melon_stem_connected",
  pumpkin_stem: "pumpkin_stem_disconnected",
  attached_pumpkin_stem: "pumpkin_stem_connected",

  // Pumpkin/Melon
  pumpkin_side: "pumpkin_side",
  pumpkin_top: "pumpkin_top",
  carved_pumpkin: "pumpkin_face_off",
  jack_o_lantern: "pumpkin_face_on",
  melon_side: "melon_side",
  melon_top: "melon_top",

  // Cactus
  cactus_side: "cactus_side",
  cactus_top: "cactus_top",
  cactus_bottom: "cactus_bottom",

  // Sugar cane
  sugar_cane: "reeds",

  // Lily pad
  lily_pad: "waterlily",

  // Vines
  vine: "vine",

  // Fire
  fire_0: "fire_0",
  fire_1: "fire_1",
  soul_fire_0: "soul_fire_0",
  soul_fire_1: "soul_fire_1",

  // Water/Lava
  water_still: "water_still",
  water_flow: "water_flow",
  water_overlay: "water_overlay",
  lava_still: "lava_still",
  lava_flow: "lava_flow",

  // Nether portal
  nether_portal: "portal",

  // Command blocks
  command_block_front: "command_block_front",
  command_block_back: "command_block_back",
  command_block_side: "command_block_side",
  command_block_conditional: "command_block_conditional",
  chain_command_block_front: "chain_command_block_front",
  chain_command_block_back: "chain_command_block_back",
  chain_command_block_side: "chain_command_block_side",
  chain_command_block_conditional: "chain_command_block_conditional",
  repeating_command_block_front: "repeating_command_block_front",
  repeating_command_block_back: "repeating_command_block_back",
  repeating_command_block_side: "repeating_command_block_side",
  repeating_command_block_conditional: "repeating_command_block_conditional",

  // Spawn egg placeholder (not a block but commonly needed)
  spawner: "mob_spawner",

  // Dead bush
  dead_bush: "deadbush",

  // Seagrass
  seagrass: "seagrass",
  tall_seagrass_bottom: "seagrass_doubletall_bottom_a",
  tall_seagrass_top: "seagrass_doubletall_top_a",

  // Kelp
  kelp: "kelp_top",
  kelp_plant: "kelp_a",

  // Coral
  tube_coral: "coral_plant_blue",
  brain_coral: "coral_plant_pink",
  bubble_coral: "coral_plant_purple",
  fire_coral: "coral_plant_red",
  horn_coral: "coral_plant_yellow",
  tube_coral_block: "coral_blue",
  brain_coral_block: "coral_pink",
  bubble_coral_block: "coral_purple",
  fire_coral_block: "coral_red",
  horn_coral_block: "coral_yellow",
  dead_tube_coral_block: "coral_blue_dead",
  dead_brain_coral_block: "coral_pink_dead",
  dead_bubble_coral_block: "coral_purple_dead",
  dead_fire_coral_block: "coral_red_dead",
  dead_horn_coral_block: "coral_yellow_dead",
  tube_coral_fan: "coral_fan_blue",
  brain_coral_fan: "coral_fan_pink",
  bubble_coral_fan: "coral_fan_purple",
  fire_coral_fan: "coral_fan_red",
  horn_coral_fan: "coral_fan_yellow",
  dead_tube_coral_fan: "coral_fan_blue_dead",
  dead_brain_coral_fan: "coral_fan_pink_dead",
  dead_bubble_coral_fan: "coral_fan_purple_dead",
  dead_fire_coral_fan: "coral_fan_red_dead",
  dead_horn_coral_fan: "coral_fan_yellow_dead",
  dead_tube_coral: "coral_plant_blue_dead",
  dead_brain_coral: "coral_plant_pink_dead",
  dead_bubble_coral: "coral_plant_purple_dead",
  dead_fire_coral: "coral_plant_red_dead",
  dead_horn_coral: "coral_plant_yellow_dead",

  // Lanterns
  lantern: "lantern",
  soul_lantern: "soul_lantern",

  // Campfire
  campfire_fire: "campfire",
  campfire_log: "campfire_log",
  campfire_log_lit: "campfire_log_lit",
  soul_campfire_fire: "soul_campfire",
  soul_campfire_log_lit: "soul_campfire_log_lit",

  // Torch
  torch: "torch_on",
  soul_torch: "soul_torch",

  // Chain
  iron_chain: "chain",

  // Honey
  honey_block_bottom: "honey_bottom",
  honey_block_side: "honey_side",
  honey_block_top: "honey_top",

  // Slime
  slime_block: "slime",

  // Sponge
  sponge: "sponge",
  wet_sponge: "sponge_wet",

  // Ice
  ice: "ice",
  packed_ice: "ice_packed",
  blue_ice: "blue_ice",
  frosted_ice_0: "frosted_ice_0",
  frosted_ice_1: "frosted_ice_1",
  frosted_ice_2: "frosted_ice_2",
  frosted_ice_3: "frosted_ice_3",

  // Snow
  snow: "snow",

  // Grass
  grass_block_top: "grass_top",
  grass_block_side: "grass_side",
  grass_block_side_overlay: "grass_side_carried",
  grass_block_snow: "grass_side_snowed",

  // Dirt variants
  dirt: "dirt",
  coarse_dirt: "coarse_dirt",
  rooted_dirt: "dirt_with_roots",

  // Mycelium
  mycelium_side: "mycelium_side",
  mycelium_top: "mycelium_top",

  // Podzol
  podzol_side: "dirt_podzol_side",
  podzol_top: "dirt_podzol_top",

  // Dirt path
  dirt_path_side: "grass_path_side",
  dirt_path_top: "grass_path_top",

  // Farmland
  farmland: "farmland_dry",
  farmland_moist: "farmland_wet",

  // Clay
  clay: "clay",

  // Gravel
  gravel: "gravel",

  // Sand
  sand: "sand",
  red_sand: "red_sand",

  // Soul sand/soil
  soul_sand: "soul_sand",
  soul_soil: "soul_soil",

  // Glowstone
  glowstone: "glowstone",

  // Sea lantern
  sea_lantern: "sea_lantern",

  // Shroomlight
  shroomlight: "shroomlight",

  // Bookshelf
  bookshelf: "bookshelf",

  // Enchanting table
  enchanting_table_bottom: "enchanting_table_bottom",
  enchanting_table_side: "enchanting_table_side",
  enchanting_table_top: "enchanting_table_top",

  // Brewing stand
  brewing_stand: "brewing_stand",
  brewing_stand_base: "brewing_stand_base",

  // Furnace
  furnace_front: "furnace_front_off",
  furnace_front_on: "furnace_front_on",
  furnace_side: "furnace_side",
  furnace_top: "furnace_top",

  // Crafting table
  crafting_table_front: "crafting_table_front",
  crafting_table_side: "crafting_table_side",
  crafting_table_top: "crafting_table_top",

  // Note block / Jukebox
  note_block: "noteblock",
  jukebox_side: "jukebox_side",
  jukebox_top: "jukebox_top",

  // Dispenser / Dropper
  dispenser_front: "dispenser_front_horizontal",
  dispenser_front_vertical: "dispenser_front_vertical",
  dropper_front: "dropper_front_horizontal",
  dropper_front_vertical: "dropper_front_vertical",

  // Hopper
  hopper_inside: "hopper_inside",
  hopper_outside: "hopper_outside",
  hopper_top: "hopper_top",

  // Cauldron
  cauldron_bottom: "cauldron_bottom",
  cauldron_inner: "cauldron_inner",
  cauldron_side: "cauldron_side",
  cauldron_top: "cauldron_top",

  // Beacon
  beacon: "beacon",

  // Conduit
  conduit: "conduit",

  // End rod
  end_rod: "end_rod",

  // Dragon egg
  dragon_egg: "dragon_egg",

  // Chorus plant/flower
  chorus_plant: "chorus_plant",
  chorus_flower: "chorus_flower",
  chorus_flower_dead: "chorus_flower_dead",

  // Crying obsidian
  crying_obsidian: "crying_obsidian",

  // Respawn anchor
  respawn_anchor_bottom: "respawn_anchor_bottom",
  respawn_anchor_side0: "respawn_anchor_side0",
  respawn_anchor_side1: "respawn_anchor_side1",
  respawn_anchor_side2: "respawn_anchor_side2",
  respawn_anchor_side3: "respawn_anchor_side3",
  respawn_anchor_side4: "respawn_anchor_side4",
  respawn_anchor_top: "respawn_anchor_top",
  respawn_anchor_top_off: "respawn_anchor_top_off",

  // Lodestone
  lodestone_side: "lodestone_side",
  lodestone_top: "lodestone_top",

  // Target
  target_side: "target_side",
  target_top: "target_top",

  // Hay block
  hay_block_side: "hay_block_side",
  hay_block_top: "hay_block_top",

  // Bone block
  bone_block_side: "bone_block_side",
  bone_block_top: "bone_block_top",

  // Dried kelp block
  dried_kelp_bottom: "dried_kelp_bottom",
  dried_kelp_side: "dried_kelp_side",
  dried_kelp_top: "dried_kelp_top",

  // Nether wart block
  nether_wart_block: "nether_wart_block",
  warped_wart_block: "warped_wart_block",

  // Nether wart crop
  nether_wart_stage0: "nether_wart_stage_0",
  nether_wart_stage1: "nether_wart_stage_1",
  nether_wart_stage2: "nether_wart_stage_2",
};

/** Bedrock texture base name to every Java name that sources from it. */
export const BEDROCK_TO_JAVA: ReadonlyMap<string, readonly string[]> = Object.entries(
  JAVA_TO_BEDROCK,
).reduce((accumulator, [javaName, bedrockName]) => {
  const existing = accumulator.get(bedrockName) ?? [];
  accumulator.set(bedrockName, [...existing, javaName]);
  return accumulator;
}, new Map<string, readonly string[]>());

/**
 * Java texture names produced by a Bedrock texture.
 *
 * @param bedrockName - Bedrock base name, e.g. `log_big_oak`.
 * @returns The mapped Java names, or `[bedrockName]` when the name is shared.
 */
export function bedrockToJava(bedrockName: string): readonly string[] {
  return BEDROCK_TO_JAVA.get(bedrockName) ?? [bedrockName];
}
