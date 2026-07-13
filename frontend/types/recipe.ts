export interface Recipe {
  title: string;
  prepTime: string;
  cookTime: string;
  ingredients: string[];
  instructions: string[];
  imagePrompt?: string;
  macros?: {
    calories: string;
    protein: string;
    carbs: string;
    fat: string;
  };
}