'use client';

import { useState, KeyboardEvent, useEffect, useRef } from 'react';
import { Recipe } from '../types/recipe';

export default function Home() {
  // Input & Core Recipe States
  const [ingredients, setIngredients] = useState<string[]>([]);
  const [inputValue, setInputValue] = useState<string>('');
  const [recipe, setRecipe] = useState<Recipe | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Preference & Selection Filter States
  const [diet, setDiet] = useState<string>('none');
  const [maxTime, setMaxTime] = useState<string>('');
  const [useStaples, setUseStaples] = useState<boolean>(true);
  const [servings, setServings] = useState<number>(2);
  const [cuisine, setCuisine] = useState<string>('default');
  const [persona, setPersona] = useState<string>('grandma');

  // Saved Recipes List State
  const [savedRecipes, setSavedRecipes] = useState<Recipe[]>([]);

  // Voice Recording State (Input)
  const [isListening, setIsListening] = useState<boolean>(false);
  const [isMuted, setIsMuted] = useState<boolean>(true);

  // Smart Substitution States
  const [subLoadingIndex, setSubLoadingIndex] = useState<number | null>(null);
  const [activeSubstitutions, setActiveSubstitutions] = useState<{ [key: number]: string[] }>({});

  // Active Cooking Mode & Active Timer States
  const [isCookingMode, setIsCookingMode] = useState<boolean>(false);
  const [currentStepIndex, setCurrentStepIndex] = useState<number>(0);
  const [isVoiceCookingActive, setIsVoiceCookingActive] = useState<boolean>(false);

  const [timerSeconds, setTimerSeconds] = useState<number>(0);
  const [isTimerRunning, setIsTimerRunning] = useState<boolean>(false);

  // Persistent Refs for Audio Control and Lock-Screen Syncing
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentStepIndexRef = useRef(currentStepIndex);
  const recipeRef = useRef(recipe);
  const timerSecondsRef = useRef(timerSeconds);

  // Keep references synced up for async media handlers
  useEffect(() => { currentStepIndexRef.current = currentStepIndex; }, [currentStepIndex]);
  useEffect(() => { recipeRef.current = recipe; }, [recipe]);
  useEffect(() => { timerSecondsRef.current = timerSeconds; }, [timerSeconds]);

  useEffect(() => {
    const saved = localStorage.getItem('saved_recipes');
    if (saved) {
      try {
        setSavedRecipes(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to load saved recipes");
      }
    }
  }, []);

  // Update Lock Screen Widget UI Panel dynamically
  const updateLockScreenWidget = () => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator) || !recipeRef.current) return;

    const stepText = recipeRef.current.instructions[currentStepIndexRef.current];
    const timeDisplay = timerSecondsRef.current > 0 ? `⏰ ${Math.floor(timerSecondsRef.current / 60)}:${timerSecondsRef.current % 60 < 10 ? '0' : ''}${timerSecondsRef.current % 60}` : 'Active Cooking';

    navigator.mediaSession.metadata = new MediaMetadata({
      title: `${timeDisplay} - Step ${currentStepIndexRef.current + 1}`,
      artist: stepText,
      album: recipeRef.current.title,
      artwork: [
        { src: 'https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=500', sizes: '512x512', type: 'image/jpeg' }
      ]
    });
  };

  // Web Speech Synthesis (Read Out Loud Text Engine) tailored to Persona
  const speakCurrentStep = (textToSpeak: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    // 🛑 GUARD CLAUSE FOR NO-AUDIO OPTION
    if (isMuted) {
      window.speechSynthesis.cancel(); // Silences anything currently running
      return;
    }
    // Cancel any current narration lines queued up
    window.speechSynthesis.cancel();

    // Remove brackets like [🔥 Low Heat] so voice synthesis doesn't read emojis out loud
    const cleanText = textToSpeak.replace(/\[.*?\]/g, '').trim();
    const utterance = new SpeechSynthesisUtterance(cleanText);

    // Apply voice modulation parameters based on target instructor persona
    if (persona === 'gordon') {
      utterance.rate = 1.25;  // Rapid, fast-paced
      utterance.pitch = 1.0;
    } else if (persona === 'zen') {
      utterance.rate = 0.85;  // Meditative, slow, paced
      utterance.pitch = 0.9;
    } else {
      // Grandma Defaults
      utterance.rate = 0.95;  // Slightly warm and slow
      utterance.pitch = 1.1;  // Friendly higher frequency
    }

    window.speechSynthesis.speak(utterance);
  };

  // Timer Countdown Effect Engine
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning && timerSeconds > 0) {
      interval = setInterval(() => {
        setTimerSeconds(prev => {
          const nextSec = prev - 1;
          timerSecondsRef.current = nextSec;
          updateLockScreenWidget();
          return nextSec;
        });
      }, 1000);
    } else if (timerSeconds === 0 && isTimerRunning) {
      setIsTimerRunning(false);
      if (typeof window !== 'undefined') {
        const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.8);
        alert("⏱️ Timer finished for this cooking step!");
      }
    }
    return () => clearInterval(interval);
  }, [isTimerRunning, timerSeconds]);

  // Handle active content scans when moving through steps
  useEffect(() => {
    if (!recipe || !isCookingMode) return;
    const currentStepText = recipe.instructions[currentStepIndex];

    const match = currentStepText.match(/(\d+)\s*(minutes|minute|mins|min)/i);
    if (match && match[1]) {
      const calculatedSecs = parseInt(match[1]) * 60;
      setTimerSeconds(calculatedSecs);
      timerSecondsRef.current = calculatedSecs;
    } else {
      setTimerSeconds(0);
      timerSecondsRef.current = 0;
    }
    setIsTimerRunning(false);
    updateLockScreenWidget();

    // Automatically narrate step every time user shifts card panels
    speakCurrentStep(currentStepText);
  }, [currentStepIndex, isCookingMode, recipe]);

  // Setup the Hardware Action Controls for lock-screen toggling
  const startLockScreenEngine = () => {
    if (typeof window === 'undefined' || !('mediaSession' in navigator)) return;

    if (!audioRef.current) {
      const silentAudioUrl = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBAAAAABAAEARKwAAIhYAQACABAAZGF0YQQAAAAAAAUA";
      audioRef.current = new Audio(silentAudioUrl);
      audioRef.current.loop = true;
    }

    audioRef.current.play().catch(() => console.log("Audio requires click gesture."));

    navigator.mediaSession.setActionHandler('nexttrack', () => {
      if (!recipeRef.current) return;
      setCurrentStepIndex(prev => {
        const nextIdx = Math.min(prev + 1, recipeRef.current!.instructions.length - 1);
        currentStepIndexRef.current = nextIdx;
        return nextIdx;
      });
    });

    navigator.mediaSession.setActionHandler('previoustrack', () => {
      setCurrentStepIndex(prev => {
        const prevIdx = Math.max(prev - 1, 0);
        currentStepIndexRef.current = prevIdx;
        return prevIdx;
      });
    });

    navigator.mediaSession.setActionHandler('play', () => setIsTimerRunning(true));
    navigator.mediaSession.setActionHandler('pause', () => setIsTimerRunning(false));
  };

  const stopLockScreenEngine = () => {
    if (audioRef.current) audioRef.current.pause();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      const trimmedValue = inputValue.trim().toLowerCase();
      if (trimmedValue && !ingredients.includes(trimmedValue)) {
        setIngredients([...ingredients, trimmedValue]);
        setInputValue('');
      }
    }
  };

  const removeIngredient = (indexToRemove: number) => {
    setIngredients(ingredients.filter((_, index) => index !== indexToRemove));
  };

  const startSpeechRecognition = () => {
    const anyWindow = typeof window !== 'undefined' ? (window as any) : null;
    if (!anyWindow) return;

    const SpeechRecognition = anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice input unsupported.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.continuous = false;
    recognition.lang = 'en-US';
    recognition.interimResults = false;

    recognition.onstart = () => { setIsListening(true); };
    recognition.onerror = () => { setIsListening(false); };
    recognition.onend = () => { setIsListening(false); };

    recognition.onresult = (event: any) => {
      const speechToText = event.results[0][0].transcript;
      const spokenIngredients = speechToText
        .replace(/ and /g, ',')
        .split(/[ ,]+/)
        .map((i: string) => i.trim().toLowerCase())
        .filter((i: string) => i.length > 0);

      const uniqueNewIngredients = spokenIngredients.filter((i: string) => !ingredients.includes(i));
      if (uniqueNewIngredients.length > 0) {
        setIngredients([...ingredients, ...uniqueNewIngredients]);
      }
    };

    recognition.start();
  };

  const generateRecipe = async (forcedServings?: number) => {
    if (ingredients.length === 0) {
      setError('Please add at least one ingredient first!');
      return;
    }

    setLoading(true);
    setError('');
    setRecipe(null);
    setActiveSubstitutions({});

    try {
      const response = await fetch('https://recipe-generator-backend-d1lh.onrender.com/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients,
          diet,
          maxTime: maxTime ? parseInt(maxTime) : null,
          useStaples,
          servings: forcedServings || servings,
          cuisine,
          persona
        }),
      });

      if (!response.ok) throw new Error('Failed to generate recipe.');

      const data: Recipe = await response.json();
      setRecipe(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleGetSubstitutions = async (ingredientName: string, index: number) => {
    if (!recipe) return;
    setSubLoadingIndex(index);

    try {
      const response = await fetch('https://recipe-generator-backend-d1lh.onrender.com/api/substitute', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredient: ingredientName,
          recipeTitle: recipe.title
        })
      });

      if (!response.ok) throw new Error();
      const data = await response.json();

      setActiveSubstitutions(prev => ({
        ...prev,
        [index]: data.substitutions
      }));
    } catch (err) {
      alert("Could not fetch alternatives.");
    } finally {
      setSubLoadingIndex(null);
    }
  };

  const handleSwapIngredient = async (indexToReplace: number, newIngredient: string) => {
    if (!recipe) return;

    const oldIngredientName = recipe.ingredients[indexToReplace].toLowerCase();
    const updatedInputIngredients = ingredients.map(ing =>
      ing === oldIngredientName ? newIngredient.toLowerCase() : ing
    );

    if (!updatedInputIngredients.includes(newIngredient.toLowerCase())) {
      updatedInputIngredients.push(newIngredient.toLowerCase());
    }

    setIngredients(updatedInputIngredients);

    const updatedSubs = { ...activeSubstitutions };
    delete updatedSubs[indexToReplace];
    setActiveSubstitutions(updatedSubs);

    setLoading(true);
    setError('');
    setRecipe(null);

    try {
      const response = await fetch('https://recipe-generator-backend-d1lh.onrender.com/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ingredients: updatedInputIngredients,
          diet,
          maxTime: maxTime ? parseInt(maxTime) : null,
          useStaples,
          servings,
          cuisine,
          persona
        }),
      });

      if (!response.ok) throw new Error('Failed to regenerate recipe.');

      const data: Recipe = await response.json();
      setRecipe(data);
    } catch (err: any) {
      setError(err.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const toggleVoiceCooking = (stepsLength: number) => {
    const anyWindow = typeof window !== 'undefined' ? (window as any) : null;
    if (!anyWindow) return;

    const SpeechRecognition = anyWindow.SpeechRecognition || anyWindow.webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    if (isVoiceCookingActive) {
      setIsVoiceCookingActive(false);
      return;
    }

    setIsVoiceCookingActive(true);
    const cookingRecognition = new SpeechRecognition();
    cookingRecognition.continuous = true;
    cookingRecognition.interimResults = false;
    cookingRecognition.lang = 'en-US';

    cookingRecognition.onresult = (event: any) => {
      const command = event.results[event.results.length - 1][0].transcript.toLowerCase().trim();
      if (command.includes('next')) {
        setCurrentStepIndex(prev => {
          const idx = Math.min(prev + 1, stepsLength - 1);
          currentStepIndexRef.current = idx;
          return idx;
        });
      } else if (command.includes('back') || command.includes('previous')) {
        setCurrentStepIndex(prev => {
          const idx = Math.max(prev - 1, 0);
          currentStepIndexRef.current = idx;
          return idx;
        });
      } else if (command.includes('repeat') || command.includes('speak again')) {
        if (recipeRef.current) speakCurrentStep(recipeRef.current.instructions[currentStepIndexRef.current]);
      } else if (command.includes('start timer') || command.includes('play timer')) {
        setIsTimerRunning(true);
      } else if (command.includes('stop timer') || command.includes('pause timer')) {
        setIsTimerRunning(false);
      } else if (command.includes('close') || command.includes('exit')) {
        setIsCookingMode(false);
        stopLockScreenEngine();
      }
    };

    cookingRecognition.onend = () => {
      if (isCookingMode && isVoiceCookingActive) cookingRecognition.start();
    };

    cookingRecognition.start();
  };

  const formatTimerDisplay = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  const changeServingsAndRegen = (newServings: number) => {
    if (newServings < 1) return;
    setServings(newServings);
    if (recipe) generateRecipe(newServings);
  };

  const toggleSaveRecipe = (currentRecipe: Recipe) => {
    let updatedRecipes: Recipe[];
    const isAlreadySaved = savedRecipes.some(r => r.title === currentRecipe.title);

    if (isAlreadySaved) {
      updatedRecipes = savedRecipes.filter(r => r.title !== currentRecipe.title);
    } else {
      updatedRecipes = [...savedRecipes, currentRecipe];
    }

    setSavedRecipes(updatedRecipes);
    localStorage.setItem('saved_recipes', JSON.stringify(updatedRecipes));
  };

  return (
    <main className="min-h-screen bg-gray-50 text-gray-900 py-12 px-4 sm:px-6 lg:px-8 relative">
      <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-8">

        {/* Left Input Column */}
        <div className="lg:col-span-2 space-y-6">
          <div className="text-center lg:text-left">
            <h1 className="text-4xl font-extrabold text-orange-600 tracking-tight">🧑‍🍳 Fridge Raid</h1>
            <p className="mt-2 text-gray-500">Transform scattered ingredients into delicious personalized meals instantly.</p>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
            {/* Tag Inputs */}
            <div className="space-y-2">
              <div className="flex justify-between items-center">
                <label className="block text-sm font-semibold text-gray-700">Your Ingredients:</label>
                <button
                  type="button"
                  onClick={startSpeechRecognition}
                  className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold shadow-xs border transition-all ${isListening ? 'bg-red-500 text-white border-red-600 animate-pulse' : 'bg-white hover:bg-gray-50 text-gray-700 border-gray-200'
                    }`}
                >
                  {isListening ? '🛑 Listening...' : '🎤 Talk to Fridge'}
                </button>
              </div>
            {/* new add */}
            <div className="flex flex-col gap-2"> 
              <div className="flex flex-wrap gap-2 p-2 border border-gray-200 rounded-xl bg-gray-50 focus-within:ring-2 focus-within:ring-orange-500 transition-all">
                {ingredients.map((ing, index) => (
                  <span key={index} className="inline-flex items-center gap-1 bg-orange-100 text-orange-800 text-sm font-medium px-3 py-1 rounded-full capitalize">
                    {ing}
                    <button onClick={() => removeIngredient(index)} className="text-orange-600 hover:text-orange-900 font-bold ml-1">&times;</button>
                  </span>
                ))}
                <input
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={(e) => {
                   if (e.key === 'Enter') {
                     e.preventDefault();
                     const val = inputValue.trim().toLowerCase();
                     if (val && !ingredients.includes(val)) {
                       setIngredients([...ingredients, val]);
                       setInputValue('');
                      }
                   }
                }}
                placeholder="Add item..."
                className="flex-1 bg-transparent border-none outline-none text-sm p-1 min-w-[120px]"
                />
            </div>
              {/* ADD BUTTON FOR MOBILE RELIABILITY */}
              <button
                type="button"
                onClick={() => {
                  const val = inputValue.trim().toLowerCase();
                  if (val && !ingredients.includes(val)) {
                    setIngredients([...ingredients, val]);
                    setInputValue('');
                  }
                }}
                className="w-full sm:hidden bg-orange-500 text-white py-2 rounded-xl font-bold text-sm"
              >
                + Add Ingredient
              </button>
            </div>
          </div>
            {/* Standard Filters */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Dietary Filter:</label>
                <select
                  value={diet}
                  onChange={(e) => setDiet(e.target.value)}
                  className="w-full p-2.5 border border-gray-200 bg-white rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="none">No Restrictions</option>
                  <option value="vegetarian">Vegetarian</option>
                  <option value="vegan">Vegan</option>
                  <option value="gluten-free">Gluten-Free</option>
                  <option value="keto">Keto-Friendly</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-semibold text-gray-700 mb-1">Max Cook Time (Mins):</label>
                <input
                  type="number"
                  value={maxTime}
                  onChange={(e) => setMaxTime(e.target.value)}
                  placeholder="e.g., 30"
                  className="w-full p-2.5 border border-gray-200 bg-white rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                />
              </div>
            </div>

            {/* Premium Multi-Feature Dynamic Filter Row (Cuisine Style & Chef Persona) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2 border-t border-gray-100">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">🌍 Cuisine Transformation:</label>
                <select
                  value={cuisine}
                  onChange={(e) => setCuisine(e.target.value)}
                  className="w-full p-2.5 border border-orange-200 bg-orange-50/40 text-orange-900 font-medium rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="default">Chef's Instinct (Default)</option>
                  <option value="indian">🇮🇳 Indian Twist</option>
                  <option value="italian">🇮🇹 Italian Flare</option>
                  <option value="mexican">🇲🇽 Mexican Fiesta</option>
                  <option value="thai">🇹🇭 Thai Infusion</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">🎙️ AI Audio Personality:</label>
                <select
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  disabled={isMuted} // Disables pickers if muted
                  className="w-full p-2.5 border border-orange-200 bg-orange-50/40 text-orange-900 font-medium rounded-xl text-sm focus:ring-2 focus:ring-orange-500 outline-none"
                >
                  <option value="grandma">👵 Warm Grandma (Patient)</option>
                  <option value="gordon">🔥 Chef Gordon (High Energy)</option>
                  <option value="zen">🧘 Zen Nutritionist (Mindful)</option>
                </select>
                {/* Add this clean toggle underneath */}
                <label className="mt-1.5 flex items-center gap-1.5 cursor-pointer text-xs font-semibold text-gray-500 hover:text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={isMuted}
                    onChange={(e) => {
                      setIsMuted(e.target.checked);
                      if (e.target.checked && typeof window !== 'undefined') window.speechSynthesis.cancel();
                    }}
                    className="accent-orange-600 rounded"
                  />
                  Mute text-to-speech engine (Text Only Mode)
                </label>
              </div>
            </div>

            {/* Serving Incrementor */}
            {/* <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <span className="block text-sm font-semibold text-gray-800">Target Recipe Servings</span>
                <span className="text-xs text-gray-500">AI scales weights and calculates specific nutrition parameters.</span>
              </div>
              <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden shadow-xs">
                <button
                  onClick={() => changeServingsAndRegen(servings - 1)}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 font-extrabold border-r transition-all"
                >-</button>
                <span className="px-4 font-bold text-sm text-gray-800">{servings} Servings</span>
                <button
                  onClick={() => changeServingsAndRegen(servings + 1)}
                  className="px-3 py-1.5 bg-gray-50 hover:bg-gray-100 text-gray-600 font-extrabold border-l transition-all"
                >+</button>
              </div>
            </div> */}
            {/* Target Recipe Servings - Responsive Fix */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100 gap-4">
              <div className="flex-1">
                <span className="block text-sm font-bold text-gray-800">Target Recipe Servings</span>
                <span className="text-xs text-gray-500">AI scales weights and nutrition parameters automatically.</span>
              </div>
              
              <div className="flex items-center bg-white border border-gray-200 rounded-xl overflow-hidden shadow-sm w-full sm:w-auto h-12">
                <button
                  type="button"
                  onClick={() => changeServingsAndRegen(Math.max(1, servings - 1))}
                  className="px-6 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-extrabold border-r transition-all h-full"
                >-</button>
                
                <span className="px-6 font-bold text-gray-800 text-sm flex-1 text-center whitespace-nowrap">
                  {servings} Servings
                </span>
                
                <button
                  type="button"
                  onClick={() => changeServingsAndRegen(servings + 1)}
                  className="px-6 py-2 bg-gray-50 hover:bg-gray-100 text-gray-600 font-extrabold border-l transition-all h-full"
                >+</button>
              </div>
            </div>


            
            


            <div className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
              <div>
                <span className="block text-sm font-semibold text-gray-800">Include Pantry Staples</span>
                <span className="text-xs text-gray-500">Assume basic salt, pepper, and oils are available.</span>
              </div>
              <input
                type="checkbox"
                checked={useStaples}
                onChange={(e) => setUseStaples(e.target.checked)}
                className="w-5 h-5 accent-orange-600 rounded cursor-pointer"
              />
            </div>

            {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

            <button
              onClick={() => generateRecipe()}
              disabled={loading || ingredients.length === 0}
              className="w-full bg-orange-600 hover:bg-orange-700 disabled:bg-gray-200 disabled:cursor-not-allowed text-white font-bold py-3 px-4 rounded-xl shadow transition duration-150"
            >
              {loading ? "Chef is writing your custom profile blueprint..." : "Generate Personalized Recipe"}
            </button>
          </div>

          {/* Active Recipe Display Container Panel */}
          {recipe && (
            <div className="bg-white rounded-2xl shadow-md border border-gray-100 p-6 space-y-6">
              <div className="flex justify-between items-start gap-4">
                <div>
                  <h2 className="text-3xl font-bold text-gray-900">{recipe.title}</h2>
                  <div className="flex flex-wrap gap-4 mt-2 text-sm text-gray-500 font-semibold items-center">
                    <span>⏱️ Prep: {recipe.prepTime}</span>
                    <span>🍳 Cook: {recipe.cookTime}</span>
                    <span className="bg-orange-50 text-orange-700 px-2.5 py-0.5 rounded-md text-xs border border-orange-100 font-bold">{servings} Servings ({cuisine} mode)</span>
                  </div>
                </div>
                {/* <div className="flex gap-2"> */}
                <div className="flex gap-2 w-full md:w-auto shrink-0 mt-4 md:mt-0">
                  <button
                    onClick={() => {
                      setCurrentStepIndex(0);
                      currentStepIndexRef.current = 0;
                      setIsCookingMode(true);
                      startLockScreenEngine();
                    }}
                    /* {/* className="flex-1 md:flex-none justify-center px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl shadow-sm transition-all flex items-center gap-1.5" */
                    className="px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-sm rounded-xl shadow-xs transition-all flex items-center gap-1.5"
                  >
                    Enter Cooking Mode
                  </button>
                  <button
                    onClick={() => toggleSaveRecipe(recipe)}
                    className="p-2 rounded-xl bg-orange-50 hover:bg-orange-100 transition-all text-xl border flex items-center justify-center shrink-0"
                  >
                    {savedRecipes.some(r => r.title === recipe.title) ? '★' : '☆'}
                  </button>
                </div>
              </div>

              {/* Macros Panel */}
              {recipe.macros && (
                <div className="bg-orange-50/60 rounded-xl border border-orange-100/70 p-4 grid grid-cols-4 gap-2 text-center">
                  <div>
                    <span className="block text-xs font-semibold text-orange-600 uppercase tracking-wider">Calories</span>
                    <span className="text-base font-extrabold text-gray-800">{recipe.macros.calories}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-orange-600 uppercase tracking-wider">Protein</span>
                    <span className="text-base font-extrabold text-gray-800">{recipe.macros.protein}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-orange-600 uppercase tracking-wider">Carbs</span>
                    <span className="text-base font-extrabold text-gray-800">{recipe.macros.carbs}</span>
                  </div>
                  <div>
                    <span className="block text-xs font-semibold text-orange-600 uppercase tracking-wider">Fat</span>
                    <span className="text-base font-extrabold text-gray-800">{recipe.macros.fat}</span>
                  </div>
                </div>
              )}

              {/* Ingredients and Substitutions */}
              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-2">Ingredients Needed</h3>
                <ul className="space-y-2.5">
                  {recipe.ingredients.map((ing, idx) => (
                    <li key={idx} className="text-gray-600">
                      <div className="flex items-center justify-between bg-gray-50/50 hover:bg-gray-50 border border-gray-100 p-2 rounded-xl transition-all">
                        <span className="capitalize font-medium pl-2">{ing}</span>
                        <button
                          onClick={() => handleGetSubstitutions(ing, idx)}
                          disabled={subLoadingIndex === idx}
                          className="text-xs font-bold text-orange-600 hover:text-orange-700 bg-orange-50 hover:bg-orange-100/80 transition-colors px-2.5 py-1.5 rounded-lg"
                        >
                          {subLoadingIndex === idx ? 'Finding...' : '🔄 Substitute'}
                        </button>
                      </div>

                      {activeSubstitutions[idx] && (
                        <div className="mt-1.5 ml-4 p-2 bg-amber-50/60 border border-amber-100 rounded-xl space-y-1">
                          <span className="text-xs font-semibold text-amber-700 block mb-1 px-1">Suggested Alternates:</span>
                          <div className="flex flex-wrap gap-1.5">
                            {activeSubstitutions[idx].map((subItem, sIdx) => (
                              <button
                                key={sIdx}
                                onClick={() => handleSwapIngredient(idx, subItem)}
                                className="bg-white hover:bg-orange-600 border border-amber-200 text-xs text-gray-700 hover:text-white font-medium px-2.5 py-1 rounded-lg transition-all capitalize"
                              >
                                {subItem}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </li>
                  ))}
                </ul>
              </div>

              <hr className="border-gray-100" />

              <div>
                <h3 className="text-lg font-bold text-gray-800 mb-3">Instructions ({persona} Tone)</h3>
                <ol className="space-y-4">
                  {recipe.instructions.map((step, idx) => (
                    <li key={idx} className="flex gap-4 items-start">
                      <span className="flex-shrink-0 w-6 h-6 rounded-full bg-orange-500 text-white text-xs font-bold flex items-center justify-center mt-0.5">{idx + 1}</span>
                      <p className="text-gray-600 leading-relaxed">{step}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-4 h-fit max-h-[85vh] overflow-y-auto">
          <h2 className="text-xl font-bold text-gray-800 border-b pb-2">⭐ Saved Recipes ({savedRecipes.length})</h2>
          {savedRecipes.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No saved recipes yet.</p>
          ) : (
            <div className="space-y-3">
              {savedRecipes.map((saved, idx) => (
                <div
                  key={idx}
                  onClick={() => setRecipe(saved)}
                  className="p-3 bg-gray-50 hover:bg-orange-50 border border-gray-100 rounded-xl cursor-pointer transition-all flex justify-between items-center group"
                >
                  <div className="truncate pr-2">
                    <span className="font-semibold text-sm text-gray-800 group-hover:text-orange-700 block truncate">{saved.title}</span>
                    <span className="text-xs text-gray-400">⏱️ {saved.cookTime}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      toggleSaveRecipe(saved);
                    }}
                    className="text-gray-400 hover:text-red-500 font-bold px-1 text-sm"
                  >
                    &times;
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Immersive Active Cooking Mode Portal with Text-to-Speech Persona Engine */}
      {isCookingMode && recipe && (
        <div className="fixed inset-0 bg-white z-50 flex flex-col justify-between p-6 sm:p-12 animate-fadeIn">
          {/* Active Mode Header */}
          <div className="flex justify-between items-center border-b pb-4">
            <div>
              <span className="text-xs font-bold text-orange-600 uppercase tracking-widest block mb-1">
                Cooking Mode Active • Voice: {persona}
              </span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-gray-900 truncate max-w-lg">{recipe.title}</h2>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleVoiceCooking(recipe.instructions.length)}
                className={`px-4 py-2 rounded-xl text-xs font-extrabold border shadow-xs transition-all flex items-center gap-2 ${isVoiceCookingActive
                  ? 'bg-red-500 text-white border-red-600 animate-pulse'
                  : 'bg-gray-50 hover:bg-gray-100 text-gray-700'
                  }`}
              >
                {isVoiceCookingActive ? '🛑 Voice active ("Repeat" supported)' : '🎤 Enable Hands-Free'}
              </button>
              <button
                onClick={() => {
                  setIsCookingMode(false);
                  setIsVoiceCookingActive(false);
                  stopLockScreenEngine();
                }}
                className="text-gray-400 hover:text-gray-900 font-extrabold text-2xl px-2"
              >
                &times;
              </button>
            </div>
          </div>

          {/* Active Card Body */}
          <div className="my-auto max-w-4xl mx-auto w-full space-y-8 py-6">
            <div className="flex items-center gap-4">
              <span className="px-4 py-2 bg-orange-600 text-white text-lg font-black rounded-xl">
                Step {currentStepIndex + 1} of {recipe.instructions.length}
              </span>
              <div className="h-2 flex-1 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-orange-500 transition-all duration-300"
                  style={{ width: `${((currentStepIndex + 1) / recipe.instructions.length) * 100}%` }}
                />
              </div>
            </div>

            <p className="text-3xl sm:text-4xl lg:text-5xl font-medium text-gray-800 leading-relaxed tracking-tight">
              {recipe.instructions[currentStepIndex]}
            </p>

            <div className="flex justify-center">
              <button
                onClick={() => speakCurrentStep(recipe.instructions[currentStepIndex])}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-xl border flex items-center gap-1 transition-all"
              >
                🔊 Repeat Audio Narration
              </button>
            </div>

            {/* Countdown Timer */}
            {timerSeconds > 0 && (
              <div className="bg-orange-50 border border-orange-100 rounded-2xl p-6 max-w-md mx-auto shadow-sm flex flex-col items-center space-y-4">
                <div className="text-center">
                  <span className="text-xs font-bold text-orange-600 uppercase tracking-wider block mb-1">⏰ Step Countdown</span>
                  <span className="text-5xl font-black font-mono text-gray-800 tracking-tight">
                    {formatTimerDisplay(timerSeconds)}
                  </span>
                </div>
                <div className="flex gap-2 w-full">
                  <button
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                    className={`flex-1 py-2.5 rounded-xl font-bold text-sm shadow-xs transition-all ${isTimerRunning ? 'bg-amber-500 hover:bg-amber-600 text-white' : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                      }`}
                  >
                    {isTimerRunning ? '⏸️ Pause' : '▶️ Start'}
                  </button>
                  <button
                    onClick={() => {
                      setIsTimerRunning(false);
                      const currentStepText = recipe.instructions[currentStepIndex];
                      const match = currentStepText.match(/(\d+)\s*(minutes|minute|mins|min)/i);
                      if (match && match[1]) setTimerSeconds(parseInt(match[1]) * 60);
                    }}
                    className="px-4 py-2.5 bg-gray-200 hover:bg-gray-300 text-gray-700 font-bold text-sm rounded-xl"
                  >
                    🔄 Reset
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Action Footer */}
          <div className="flex justify-between max-w-4xl mx-auto w-full border-t pt-6">
            <button
              onClick={() => setCurrentStepIndex(prev => Math.max(prev - 1, 0))}
              disabled={currentStepIndex === 0}
              className="px-6 py-3 border border-gray-200 text-gray-700 font-bold rounded-xl hover:bg-gray-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all"
            >
              ⬅️ Previous Step
            </button>

            {currentStepIndex < recipe.instructions.length - 1 ? (
              <button
                onClick={() => setCurrentStepIndex(prev => Math.min(prev + 1, recipe.instructions.length - 1))}
                className="px-8 py-3 bg-orange-600 text-white font-bold rounded-xl hover:bg-orange-700 shadow-xs transition-all"
              >
                Next Step ➡️
              </button>
            ) : (
              <button
                onClick={() => {
                  setIsCookingMode(false);
                  setIsVoiceCookingActive(false);
                  stopLockScreenEngine();
                }}
                className="px-8 py-3 bg-emerald-600 text-white font-bold rounded-xl hover:bg-emerald-700 shadow-xs transition-all"
              >
                🎉 Finish & Enjoy Meal!
              </button>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
