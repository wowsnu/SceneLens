from fastapi import APIRouter, HTTPException
from app.models.schemas import (
    EnhanceSketchRequest, EnhanceSketchResponse,
    GenerateSketchRequest, GenerateSketchResponse,
    GenerateLayersRequest, GenerateLayersResponse,
    GenerateSingleLayerRequest, GenerateSingleLayerResponse,
)
from app.services.image_generator import enhance_sketch, generate_sketch, generate_sketch_layers, generate_single_layer

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
        generated_image = await generate_sketch(
            request.script_context,
            request.intent,
            cir_dict,
        )
        return GenerateSketchResponse(generated_image=generated_image)
    except Exception as e:
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
