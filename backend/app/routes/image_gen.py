import time
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    EnhanceSketchRequest, EnhanceSketchResponse,
    GenerateSketchRequest, GenerateSketchResponse,
    GenerateLayersRequest, GenerateLayersResponse,
    GenerateSingleLayerRequest, GenerateSingleLayerResponse,
    GenerateSvgLayersRequest, GenerateSvgLayersResponse,
    ReframeSketchRequest, ReframeSketchResponse,
    VectorizeRequest, VectorizeResponse,
)
from app.services.image_generator import enhance_sketch, generate_sketch, generate_sketch_svg, generate_sketch_layers, generate_single_layer, generate_svg_layers, reframe_sketch, vectorize_image

router = APIRouter()


@router.post("/enhance-sketch", response_model=EnhanceSketchResponse)
async def enhance_sketch_endpoint(request: EnhanceSketchRequest):
    try:
        enhanced_image = await enhance_sketch(
            request.image,
            request.script_context,
            request.intent,
            prompt=request.prompt,
            shared=request.shared,
            previous=request.previous,
            references=request.references,
            style=request.style,
            style_preset=request.style_preset,
            layout=request.layout,
            mode=request.mode or "add",
        )
        return EnhanceSketchResponse(enhanced_image=enhanced_image)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-sketch", response_model=GenerateSketchResponse)
async def generate_sketch_endpoint(request: GenerateSketchRequest):
    try:
        cir_dict = request.cir.model_dump() if request.cir else None
        output_format = request.output_format or "png"

        if output_format == "svg":
            print(f"[generate-sketch] Using Recraft SVG")
            svg_str = await generate_sketch_svg(
                request.script_context,
                request.intent,
                cir_dict,
                request.scene_script or "",
                request.detail_level if request.detail_level is not None else 50,
            )
            return GenerateSketchResponse(generated_image=svg_str, output_format="svg")
        else:
            generated_image = await generate_sketch(
                request.script_context,
                request.intent,
                cir_dict,
            )
            return GenerateSketchResponse(generated_image=generated_image, output_format="png")
    except Exception as e:
        print(f"[generate-sketch] ERROR: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-layers", response_model=GenerateLayersResponse)
async def generate_layers_endpoint(request: GenerateLayersRequest):
    try:
        layers = await generate_sketch_layers(
            request.script_context,
            request.intent,
            request.layers,
        )
        return GenerateLayersResponse(layers=layers)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/reframe-sketch", response_model=ReframeSketchResponse)
async def reframe_sketch_endpoint(request: ReframeSketchRequest):
    t0 = time.time()
    cir_dict = request.cir.model_dump()
    original_cir_dict = request.original_cir.model_dump() if request.original_cir else None
    print(f"[reframe-sketch] START model={request.model} cir={cir_dict}")
    print(f"[reframe-sketch] original_cir={original_cir_dict}")
    print(f"[reframe-sketch] intent={(request.intent or '').strip()[:120]!r} strategy_context_len={len((request.strategy_context or '').strip())}")
    try:
        # CIR이 동일하더라도 intent / strategy_context가 있으면 mise-only reframe으로 허용.
        has_mise_directive = bool((request.intent or "").strip()) or bool((request.strategy_context or "").strip())
        if original_cir_dict and cir_dict == original_cir_dict and not has_mise_directive:
            raise HTTPException(status_code=400, detail="No CIR changes requested. Change at least one attribute, or provide an intent/strategy context, before reframing.")

        result = await reframe_sketch(
            request.image,
            cir_dict,
            request.script_context,
            original_cir_dict,
            request.include_description if request.include_description is not None else True,
            request.model,
            request.intent or "",
            request.strategy_context or "",
        )
        elapsed = time.time() - t0
        print(f"[reframe-sketch] DONE model={request.model} elapsed={elapsed:.1f}s")
        return ReframeSketchResponse(**result)
    except HTTPException:
        raise
    except Exception as e:
        elapsed = time.time() - t0
        print(f"[reframe-sketch] ERROR model={request.model} elapsed={elapsed:.1f}s error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/vectorize", response_model=VectorizeResponse)
async def vectorize_endpoint(request: VectorizeRequest):
    t0 = time.time()
    print(f"[vectorize] START")
    try:
        svg_str = await vectorize_image(request.image)
        elapsed = time.time() - t0
        print(f"[vectorize] DONE elapsed={elapsed:.1f}s svg_len={len(svg_str)}")
        return VectorizeResponse(svg=svg_str)
    except Exception as e:
        elapsed = time.time() - t0
        print(f"[vectorize] ERROR elapsed={elapsed:.1f}s error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-svg-layers", response_model=GenerateSvgLayersResponse)
async def generate_svg_layers_endpoint(request: GenerateSvgLayersRequest):
    t0 = time.time()
    layer_names = request.layers or ["background", "character"]
    print(f"[generate-svg-layers] START layers={layer_names}")
    try:
        cir_dict = request.cir.model_dump() if request.cir else None
        result = await generate_svg_layers(
            request.script_context,
            request.intent,
            cir_dict,
            layer_names,
            request.detail_level if request.detail_level is not None else 50,
        )
        elapsed = time.time() - t0
        print(f"[generate-svg-layers] DONE elapsed={elapsed:.1f}s")
        return GenerateSvgLayersResponse(layers=result)
    except Exception as e:
        elapsed = time.time() - t0
        print(f"[generate-svg-layers] ERROR elapsed={elapsed:.1f}s error={e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/generate-layer", response_model=GenerateSingleLayerResponse)
async def generate_single_layer_endpoint(request: GenerateSingleLayerRequest):
    try:
        image = await generate_single_layer(
            request.script_context,
            request.intent,
            request.layer,
        )
        return GenerateSingleLayerResponse(layer=request.layer, image=image)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
