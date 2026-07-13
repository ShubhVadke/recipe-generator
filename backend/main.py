import os
import json
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
from groq import Groq
from dotenv import load_dotenv

# 1. Environment and App Setup
load_dotenv()

app = FastAPI(title="AI Recipe Generator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 2. Client Initialization
api_key = os.getenv("GROQ_API_KEY")
if not api_key:
    raise RuntimeError("GROQ_API_KEY not found in environment variables.")

client = Groq(api_key=api_key)

# 3. Data Models
class RecipeRequest(BaseModel):
    ingredients: List[str]
    diet: str = "none"                
    maxTime: Optional[int] = None    
    useStaples: bool = True           
    servings: int = 2  
    cuisine: str = "default"  # Added feature 2 parameter
    persona: str = "grandma"  # Added feature 4 parameter

class SubstituteRequest(BaseModel):
    ingredient: str
    recipeTitle: str

# 4. Route Endpoints
@app.post("/api/generate")
async def generate_recipe(request: RecipeRequest):
    if not request.ingredients:
        raise HTTPException(status_code=400, detail="Please provide at least one ingredient.")
    
    ingredients_list = ", ".join(request.ingredients)
    
    staples_instruction = (
        "You may also assume the user has basic pantry staples available (e.g., salt, pepper, cooking oil, water, butter) without explicitly being provided them."
        if request.useStaples else 
        "Do NOT assume the user has ANY extra ingredients or staples outside of the explicitly provided list."
    )
    
    diet_instruction = f"The recipe MUST be strictly {request.diet}." if request.diet != "none" else ""
    time_instruction = f"The total preparation and cooking time combined MUST be strictly under {request.maxTime} minutes." if request.maxTime else ""

    # Cuisine Layer Rules
    cuisine_instruction = ""
    if request.cuisine != "default":
        cuisine_instruction = (
            f"CUISINE STYLE OVERRIDE: Modify the dish profile to be authentically '{request.cuisine}'. "
            f"You may introduce herbs, spices, and cooking techniques typical of '{request.cuisine}' cuisine "
            f"to transform the flavor profile, but you must still lean primarily on the base ingredients listed by the user."
        )

    # Tone/Persona Layer Rules
    persona_map = {
        "gordon": "An intense, high-energy, fiery professional chef. Use short sentences, energetic cooking vocabulary, and enthusiastic motivational phrases like 'Push it!', 'Stunning!', 'Focus now!', or 'Don't overcook it!'. Keep it fun but urgent.",
        "grandma": "A deeply loving, warm, traditional, and incredibly patient grandmother. Use comforting words, gentle reminders, and reassuring phrases like 'Take your time, dear', 'Smells beautiful already', or 'Give it a nice, cozy stir'.",
        "zen": "A calm, meditative, minimalist mindful nutrition coach. Focus on sensory grounding, steady breathing, and peaceful descriptions like 'Observe the change in aroma', 'Let the heat transform the food gracefully', or 'Breathe as it simmers peacefully'."
    }
    chosen_persona_rules = persona_map.get(request.persona, persona_map["grandma"])

    system_prompt = (
        f"You are an expert chef, nutritionist, and culinary instructor teaching beginner home cooks. Your voice personality is: {chosen_persona_rules}\n\n"
        f"Create a realistic recipe designed strictly for EXACTLY {request.servings} servings based primarily on the available ingredients provided. "
        f"{staples_instruction} {diet_instruction} {time_instruction}\n"
        f"{cuisine_instruction}\n\n"
        f"CRITICAL PORTION SIZE RULE:\n"
        f"You MUST scale your chosen ingredient quantities and calculate the final overall 'macros' (calories, protein, carbs, fat) so they accurately represent the combined values for exactly {request.servings} servings.\n\n"
        "CRITICAL INSTRUCTIONAL RULE:\n"
        "Write highly descriptive, detailed, and explicit step-by-step guidance in the 'instructions' array so that absolute beginners can easily understand.\n"
        "1. Adopt the text tone and style of your assigned personality naturally across all text strings within the instructions array.\n"
        "2. For every single cooking step that requires a stove, gas range, or pan, you MUST prefix the step string with a clear flame heat level indicator using these exact formats:\n"
        "   - '[🔥 Low Heat]' for low simmers, melting butter, or sweating garlic.\n"
        "   - '[🔥🔥 Medium Heat]' for pan-frying, boiling water, or standard sautés.\n"
        "   - '[🔥🔥🔥 High Heat]' for searing meat, stir-frying, or rapid boiling.\n"
        "   If a step does not involve heat (like chopping, prepping, or plating), do not add a heat prefix.\n"
        "3. Specify detailed timing indicators directly within the text string (e.g., 'cook for 5 minutes' or 'simmer for 10 minutes') along with explicit visual/sensory cues.\n\n"
        "You MUST return your response strictly as a JSON object matching this structure exactly:\n"
        "{\n"
        '  "title": "Recipe Name",\n'
        '  "prepTime": "10 mins",\n'
        '  "cookTime": "20 mins",\n'
        f'  "ingredients": ["Explicit portion weight/amount for {request.servings} servings ingredient 1", "Explicit portion weight/amount for {request.servings} servings ingredient 2"],\n'
        '  "instructions": ["Step 1 text matching your personality rules...", "Step 2 text matching your personality rules..."],\n'
        '  "imagePrompt": "A professional food photography shot of [Recipe Name]...",\n'
        '  "macros": {\n'
        f'    "calories": "Total kcal",\n'
        f'    "protein": "Total protein grams",\n'
        f'    "carbs": "Total carbohydrate grams",\n'
        f'    "fat": "Total fat grams"\n'
        '  }\n'
        "}\n"
        "Do not wrap your output in markdown formatting like ```json. Return raw JSON text only."
    )
        
    user_prompt = f"Available ingredients: {ingredients_list}"
    
    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile", 
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.75, # Slightly raised to give personalities more flair
            response_format={"type": "json_object"}
        )
        
        recipe_data = json.loads(completion.choices[0].message.content)
        return recipe_data

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI generated invalid JSON. Please try again.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/substitute")
async def get_substitution(request: SubstituteRequest):
    if not request.ingredient:
        raise HTTPException(status_code=400, detail="No ingredient provided.")

    system_prompt = (
        "You are an expert culinary assistant. Provide exactly 3 common, realistic culinary alternatives/substitutions "
        f"for the requested ingredient, specifically keeping in mind the context of the dish: '{request.recipeTitle}'.\n\n"
        "You MUST return your response strictly as a JSON object matching this structure exactly:\n"
        "{\n"
        '  "substitutions": ["alternative 1", "alternative 2", "alternative 3"]\n'
        "}\n"
        "Do not wrap your output in markdown formatting like ```json. Return raw JSON text only."
    )
    
    user_prompt = f"What can I substitute for '{request.ingredient}' in this dish?"

    try:
        completion = client.chat.completions.create(
            model="llama-3.3-70b-versatile", 
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ],
            temperature=0.6,
            response_format={"type": "json_object"}
        )
        
        sub_data = json.loads(completion.choices[0].message.content)
        return sub_data

    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="AI generated invalid JSON for substitutions.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
