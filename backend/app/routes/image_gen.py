import time
from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    EnhanceSketchRequest, EnhanceSketchResponse,
    GenerateSketchRequest, GenerateSketchResponse,
    GenerateLayersRequest, GenerateLayersResponse,
    GenerateSingleLayerRequest, GenerateSingleLayerResponse,
    ReframeSketchRequest, ReframeSketchResponse,
)
from app.services.image_generator import enhance_sketch, generate_sketch, generate_sketch_svg, generate_sketch_layers, generate_single_layer, reframe_sketch

router = APIRouter()


@router.post("/enhance-sketch", response_model=EnhanceSketchResponse)
async def enhance_sketch_endpoint(request: EnhanceSketchRequest):
    try:
        enhanced_image = await enhance_sketch(
            request.image,
            request.script_context,
            request.intent,
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
    print(f"[reframe-sketch] START model={request.model} cir={request.cir.model_dump()}")
    print(f"[reframe-sketch] original_cir={request.original_cir.model_dump() if request.original_cir else None}")
    try:
        result = await reframe_sketch(
            request.image,
            request.cir.model_dump(),
            request.script_context,
            request.original_cir.model_dump() if request.original_cir else None,
            request.include_description if request.include_description is not None else True,
            request.model,
            request.intent or "",
        )
        elapsed = time.time() - t0
        print(f"[reframe-sketch] DONE model={request.model} elapsed={elapsed:.1f}s")
        return ReframeSketchResponse(**result)
    except Exception as e:
        elapsed = time.time() - t0
        print(f"[reframe-sketch] ERROR model={request.model} elapsed={elapsed:.1f}s error={e}")
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
