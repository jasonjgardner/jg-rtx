// ==============================================================================
// labPBR v1.3 Preview Shader for Adobe Substance Painter
// ==============================================================================
// Implements the labPBR (Laboratory PBR) material standard as defined at:
// https://shaderlabs.org/wiki/LabPBR_Material_Standard
//
// This shader provides full support for the labPBR texture format including:
// - Smoothness to roughness conversion
// - F0/Reflectance for dielectrics
// - Hardcoded metal types with proper IOR and extinction coefficients
// - Porosity and subsurface scattering
// - Emission
// - Material ambient occlusion
// - Height map for parallax occlusion mapping
// - Proper normal reconstruction from XY channels
// ==============================================================================

import lib-sparse.glsl
import lib-vectors.glsl
import lib-pbr.glsl
import lib-sampler.glsl
import lib-emissive.glsl
import lib-pom.glsl
import lib-normal.glsl
import lib-defines.glsl
import lib-utils.glsl

//: metadata {
//:   "mdl":"mdl::alg::materials::physically_metallic_roughness::physically_metallic_roughness"
//: }

// ==============================================================================
// TEXTURE BINDINGS
// ==============================================================================

//: param auto channel_basecolor
uniform SamplerSparse basecolor_tex;

//: param auto channel_normal
uniform SamplerSparse normal_tex;

//: param auto channel_height
uniform SamplerSparse height_tex;

// labPBR uses custom texture naming: _s for specular, _n for normal
// In Substance Painter, we'll use the specular channel for the _s texture
//: param auto channel_specular
uniform SamplerSparse specular_tex;

// ==============================================================================
// SHADER PARAMETERS (CUSTOMIZABLE)
// ==============================================================================

//: param custom {
//:   "default": true,
//:   "label": "Enable Hardcoded Metals",
//:   "group": "labPBR Features",
//:   "description": "Use physically accurate IOR values for metals (iron, gold, aluminum, etc.)"
//: }
uniform bool enable_hardcoded_metals;

//: param custom {
//:   "default": true,
//:   "label": "Enable Porosity",
//:   "group": "labPBR Features",
//:   "description": "Process porosity data for wet/dry material behavior"
//: }
uniform bool enable_porosity;

//: param custom {
//:   "default": true,
//:   "label": "Enable Subsurface Scattering",
//:   "group": "labPBR Features",
//:   "description": "Process subsurface scattering for translucent materials"
//: }
uniform bool enable_sss;

//: param custom {
//:   "default": true,
//:   "label": "Enable Emission",
//:   "group": "labPBR Features",
//:   "description": "Process emission data for glowing materials"
//: }
uniform bool enable_emission;

//: param custom {
//:   "default": true,
//:   "label": "Enable Material AO",
//:   "group": "labPBR Features",
//:   "description": "Use ambient occlusion from normal texture blue channel"
//: }
uniform bool enable_material_ao;

//: param custom {
//:   "default": false,
//:   "label": "Enable Parallax Occlusion Mapping",
//:   "group": "labPBR Features",
//:   "description": "Use height map for parallax effects (expensive)"
//: }
uniform bool enable_pom;

//: param custom {
//:   "default": 1.0,
//:   "label": "Emission Intensity",
//:   "min": 0.0,
//:   "max": 10.0,
//:   "group": "Material Adjustments",
//:   "description": "Multiplier for emission brightness"
//: }
uniform float emission_intensity;

//: param custom {
//:   "default": 1.0,
//:   "label": "Porosity Wetness",
//:   "min": 0.0,
//:   "max": 1.0,
//:   "group": "Material Adjustments",
//:   "description": "Simulate wet/dry state for porous materials (0=dry, 1=wet)"
//: }
uniform float porosity_wetness;

//: param custom {
//:   "default": 1.0,
//:   "label": "SSS Strength",
//:   "min": 0.0,
//:   "max": 2.0,
//:   "group": "Material Adjustments",
//:   "description": "Subsurface scattering strength multiplier"
//: }
uniform float sss_strength;

// ==============================================================================
// HARDCODED METAL DATA (labPBR v1.3 Specification)
// ==============================================================================

// IOR (N) values for hardcoded metals (green channel values 230-237)
vec3 getMetalIOR(int metalIndex) {
    const vec3 metalN[8] = vec3[](
        vec3(2.9114, 2.9497, 2.5845),   // 230: Iron
        vec3(0.18299, 0.42108, 1.3734),  // 231: Gold
        vec3(1.3456, 0.96521, 0.61722),  // 232: Aluminum
        vec3(3.1071, 3.1812, 2.3230),    // 233: Chrome
        vec3(0.27105, 0.67693, 1.3164),  // 234: Copper
        vec3(1.9100, 1.8300, 1.4400),    // 235: Lead
        vec3(2.3757, 2.0847, 1.8453),    // 236: Platinum
        vec3(0.15943, 0.14512, 0.13547)  // 237: Silver
    );
    return metalN[clamp(metalIndex, 0, 7)];
}

// Extinction coefficient (K) values for hardcoded metals
vec3 getMetalExtinction(int metalIndex) {
    const vec3 metalK[8] = vec3[](
        vec3(3.0893, 2.9318, 2.7670),   // 230: Iron
        vec3(3.4242, 2.3459, 1.7704),   // 231: Gold
        vec3(7.4746, 6.3995, 5.3031),   // 232: Aluminum
        vec3(3.3314, 3.3291, 3.1350),   // 233: Chrome
        vec3(3.6092, 2.6248, 2.2921),   // 234: Copper
        vec3(3.5100, 3.4000, 3.1800),   // 235: Lead
        vec3(4.2655, 3.7153, 3.1365),   // 236: Platinum
        vec3(3.9291, 3.1900, 2.3808)    // 237: Silver
    );
    return metalK[clamp(metalIndex, 0, 7)];
}

// Compute F0 from complex IOR for conductors
vec3 fresnelConductorF0(vec3 n, vec3 k) {
    vec3 n2_k2 = n*n + k*k;
    vec3 n2_1 = (n - 1.0) * (n - 1.0);
    vec3 n2_p1 = (n + 1.0) * (n + 1.0);
    return (n2_1 + k*k) / (n2_p1 + k*k);
}

// ==============================================================================
// LABPBR MATERIAL STRUCTURE
// ==============================================================================

struct LabPBRMaterial {
    vec3 baseColor;
    vec3 normal;
    float roughness;
    float f0_scalar;      // For dielectrics
    vec3 f0_color;        // For metals
    bool isMetal;
    float porosity;
    float sss;
    float emission;
    float ao;
    float height;
};

// ==============================================================================
// LABPBR DECODING FUNCTION
// ==============================================================================

LabPBRMaterial decodeLabPBR(SparseCoord coord, vec3 albedo) {
    LabPBRMaterial mat;
    
    // Sample textures
    vec4 specularData = textureSparse(specular_tex, coord);
    vec4 normalData = textureSparse(normal_tex, coord);
    
    mat.baseColor = albedo;
    
    // =========================================================================
    // SPECULAR TEXTURE DECODING (_s texture)
    // =========================================================================
    
    // RED CHANNEL: Perceptual Smoothness -> Linear Roughness (REQUIRED)
    // Formula: roughness = (1 - smoothness)^2
    float smoothness = specularData.r;
    mat.roughness = pow(1.0 - smoothness, 2.0);
    mat.roughness = clamp(mat.roughness, 0.001, 0.999); // Prevent extreme values
    
    // GREEN CHANNEL: F0/Metalness (REQUIRED)
    // Range 0-229: F0 for dielectrics (linear in v1.3)
    // Range 230-237: Hardcoded metals
    // Value 255: Generic metal (use albedo as F0)
    float greenValue = specularData.g * 255.0;
    
    if (greenValue >= 230.0 && greenValue <= 254.0) {
        // Metal workflow
        mat.isMetal = true;
        
        if (enable_hardcoded_metals && greenValue <= 237.0) {
            // Hardcoded metal with physically accurate IOR
            int metalIndex = int(round(greenValue)) - 230;
            vec3 n = getMetalIOR(metalIndex);
            vec3 k = getMetalExtinction(metalIndex);
            
            // Compute F0 from complex IOR and tint with albedo
            mat.f0_color = fresnelConductorF0(n, k) * albedo;
            mat.f0_scalar = 1.0; // Metals have high reflectance
        } else {
            // Generic metal: use albedo as F0 directly
            mat.f0_color = albedo;
            mat.f0_scalar = 1.0;
        }
    } else {
        // Dielectric workflow
        mat.isMetal = false;
        mat.f0_scalar = greenValue / 255.0; // Linear storage in v1.3
        mat.f0_color = vec3(mat.f0_scalar); // Achromatic for dielectrics
    }
    
    // BLUE CHANNEL: Porosity (0-64) or Subsurface Scattering (65-255) (OPTIONAL)
    // Only used for dielectrics
    float blueValue = specularData.b * 255.0;
    mat.porosity = 0.0;
    mat.sss = 0.0;
    
    if (!mat.isMetal) {
        if (blueValue <= 64.0 && enable_porosity) {
            // Porosity: how much water material can absorb
            mat.porosity = blueValue / 64.0;
        } else if (blueValue > 64.0 && enable_sss) {
            // Subsurface scattering
            mat.sss = (blueValue - 65.0) / 190.0;
        }
    }
    
    // ALPHA CHANNEL: Emission (0-254, NEVER 255) (OPTIONAL)
    mat.emission = enable_emission ? specularData.a : 0.0;
    
    // =========================================================================
    // NORMAL TEXTURE DECODING (_n texture)
    // =========================================================================
    
    // RED & GREEN CHANNELS: Normal XY (DirectX format, Y-down) (REQUIRED)
    // Convert from [0,1] to [-1,1]
    vec2 normalXY = normalData.rg * 2.0 - 1.0;
    
    // Reconstruct Z component using Pythagorean theorem (REQUIRED for labPBR compliance)
    float normalZ = sqrt(max(0.0, 1.0 - dot(normalXY, normalXY)));
    
    // Construct tangent-space normal and normalize
    vec3 tsNormal = normalize(vec3(normalXY, normalZ));
    mat.normal = tsNormal;
    
    // BLUE CHANNEL: Material Ambient Occlusion (INVERTED: 0=dark, 255=bright) (OPTIONAL)
    mat.ao = enable_material_ao ? normalData.b : 1.0;
    
    // ALPHA CHANNEL: Height/Displacement for POM (OPTIONAL)
    // Note: Value 0 can cause issues with POM, minimum of 1 recommended
    mat.height = normalData.a;
    
    return mat;
}

// ==============================================================================
// POROSITY EFFECT (Wet Material Darkening)
// ==============================================================================

void applyPorosityEffect(inout vec3 baseColor, inout float f0, float porosity, float wetness) {
    if (porosity > 0.0 && wetness > 0.0) {
        // Wet porous materials become darker and more reflective
        float darkeningFactor = 1.0 - (porosity * wetness * 0.5);
        baseColor *= darkeningFactor;
        
        // Increase reflectivity when wet (water has F0 ≈ 0.02)
        f0 = mix(f0, max(f0, 0.02), porosity * wetness);
    }
}

// ==============================================================================
// MAIN SHADER ENTRY POINT
// ==============================================================================

void shade(V2F inputs) {
    // =========================================================================
    // STEP 1: Apply Parallax Occlusion Mapping (if enabled)
    // =========================================================================
    if (enable_pom) {
        vec3 viewTS = worldSpaceToTangentSpace(getEyeVec(inputs.position), inputs);
        applyParallaxOffset(inputs, viewTS);
    }
    
    // =========================================================================
    // STEP 2: Sample Base Color and Decode labPBR Material
    // =========================================================================
    vec3 albedo = textureSparse(basecolor_tex, inputs.sparse_coord).rgb;
    LabPBRMaterial mat = decodeLabPBR(inputs.sparse_coord, albedo);
    
    // =========================================================================
    // STEP 3: Transform Normal from Tangent Space to World Space
    // =========================================================================
    vec3 worldNormal = normalize(
        mat.normal.x * normalize(inputs.tangent) +
        mat.normal.y * normalize(inputs.bitangent) +
        mat.normal.z * normalize(inputs.normal)
    );
    
    // Compute local frame for lighting calculations
    LocalVectors vectors;
    vectors.vertexNormal = normalize(inputs.normal);
    vectors.normal = worldNormal;
    vectors.tangent = normalize(inputs.tangent);
    vectors.bitangent = normalize(inputs.bitangent);
    vectors.eye = normalize(getEyeVec(inputs.position));
    
    // =========================================================================
    // STEP 4: Convert to Diffuse/Specular Colors
    // =========================================================================
    vec3 diffuseColor;
    vec3 specularColor;
    
    if (mat.isMetal) {
        // Metals: no diffuse, albedo tints reflections
        diffuseColor = vec3(0.0);
        specularColor = mat.f0_color;
    } else {
        // Dielectrics: albedo is diffuse color, achromatic specular
        diffuseColor = mat.baseColor;
        specularColor = vec3(mat.f0_scalar);
        
        // Apply porosity wetness effect
        if (enable_porosity && mat.porosity > 0.0) {
            applyPorosityEffect(diffuseColor, mat.f0_scalar, mat.porosity, porosity_wetness);
            specularColor = vec3(mat.f0_scalar);
        }
    }
    
    // =========================================================================
    // STEP 5: Compute Occlusion Factors
    // =========================================================================
    float shadowFactor = getShadowFactor();
    float occlusion = mat.ao * shadowFactor;
    
    // Apply specular occlusion correction (prevents overly dark metals)
    float specOcclusion = specularOcclusionCorrection(
        occlusion,
        mat.isMetal ? 1.0 : 0.0,
        mat.roughness
    );
    
    // =========================================================================
    // STEP 6: Compute PBR Lighting
    // =========================================================================
    
    // Diffuse lighting (environment irradiance)
    vec3 diffuseLighting = pbrComputeDiffuse(vectors.normal, diffuseColor);
    
    // Specular lighting (environment reflections with importance sampling)
    vec3 specularLighting = pbrComputeSpecular(vectors, specularColor, mat.roughness);
    
    // =========================================================================
    // STEP 7: Compute Emission
    // =========================================================================
    vec3 emissiveColor = vec3(0.0);
    if (enable_emission && mat.emission > 0.0) {
        // Emission uses base color as the emissive hue
        emissiveColor = mat.baseColor * mat.emission * emission_intensity;
    }
    
    // =========================================================================
    // STEP 8: Compute Subsurface Scattering Coefficients
    // =========================================================================
    vec3 sssCoefficients = vec3(0.0);
    if (enable_sss && mat.sss > 0.0) {
        // Use base color for SSS tint
        sssCoefficients = mat.baseColor * mat.sss * sss_strength;
    }
    
    // =========================================================================
    // STEP 9: Output Final Results
    // =========================================================================
    emissiveColorOutput(emissiveColor);
    albedoOutput(diffuseColor);
    diffuseShadingOutput(occlusion * diffuseLighting);
    specularShadingOutput(specOcclusion * specularLighting);
    sssCoefficientsOutput(sssCoefficients);
}