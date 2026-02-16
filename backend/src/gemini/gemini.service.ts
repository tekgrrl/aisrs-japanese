import {
  Injectable,
  Logger,
  OnModuleInit,
  InternalServerErrorException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { GoogleGenAI } from '@google/genai';
import { ApiLog, Lesson, ScenarioEvaluation } from '@/types';
import { Timestamp } from 'firebase-admin/firestore';
import { ApilogService } from '../apilog/apilog.service';
import { performance } from "perf_hooks"; // For timing

@Injectable()
export class GeminiService implements OnModuleInit {
  private readonly logger = new Logger(GeminiService.name);

  private client: GoogleGenAI;
  private modelName: string;

  constructor(
    private configService: ConfigService,
    private apilogService: ApilogService,
  ) { }

  onModuleInit() {
    const apiKey = this.configService.get<string>('GEMINI_API_KEY');
    this.modelName = this.configService.get<string>('MODEL_GEMINI_FLASH') || 'gemini-3-flash-preview';
    this.logger.log(`Using Gemini model: ${this.modelName}`);

    if (!apiKey) {
      throw new Error('GEMINI_API_KEY is not defined in environment variables');
    }

    this.client = new GoogleGenAI({ apiKey });
  }

  async evaluateAnswer(
    systemPrompt: string,
    userAnswer: string,
    expectedAnswers: string[],
    // New optional argument for structured logging
    logContext?: Record<string, any>
  ) {
    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: "/reviews/evaluate",
      status: "pending",
      modelUsed: this.modelName,
      requestData: {
        // systemPrompt, // Optional: Log prompt if needed, can be large
        userMessage: systemPrompt, // Log the core data
        // Also log the inputs separately for clarity
        input_userAnswer: logContext?.userAnswer,
        input_expectedAnswer: logContext?.expectedAnswers,
        input_question: logContext?.question,
        input_topic: logContext?.topic,
      },
    };

    const logRef = await this.apilogService.startLog(initialLogData);
    let startTime = performance.now();
    let errorOccurred = false;
    let capturedError: any;
    let evaluationResult:
      | { result: "pass" | "fail"; explanation: string }
      | undefined;

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [
          {
            parts: [
              {
                text: `User Answer: ${userAnswer}\nExpected: ${JSON.stringify(expectedAnswers)}`,
              },
            ],
          },
        ],
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          responseMimeType: 'application/json',
          responseSchema: {
            type: "OBJECT",
            properties: {
              result: { type: "STRING", enum: ["pass", "fail"] },
              explanation: { type: "STRING" },
            },
            required: ["result", "explanation"],
          },
        },
      });

      const aiJsonText = response.text;

      if (!aiJsonText) {
        this.logger.error("Empty response text from Gemini SDK", { response });
        throw new Error("Invalid response structure from Gemini");
      }

      // 4. Parse and validate (keeping your existing robust parsing logic)
      try {
        evaluationResult = JSON.parse(aiJsonText);
      } catch (parseError) {
        this.logger.error("Failed to parse AI JSON response", {
          aiJsonText,
          parseError,
        });
        throw new Error("Failed to parse AI JSON response");
      }

      if (!evaluationResult) {
        throw new Error(
          "Evaluation result is missing after AI response parsing.",
        );
      }

      return evaluationResult;

    } catch (error) {
      errorOccurred = true;
      capturedError = error;

      this.logger.error('Gemini Service Error:', error);

      let errorDetails: any = {};
      let errorMessage = "An unknown error occurred";

      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = {
          message: error.message,
          name: error.name,
          stack: error.stack,
        };
        if (
          error.message.includes("fetch") ||
          error.message.includes("network")
        ) {
          errorMessage = `Network error during API call: ${error.message}`;
        }
      } else {
        try {
          errorDetails = { rawError: JSON.stringify(error, null, 2) };
          errorMessage = `Non-Error exception: ${errorDetails.rawError}`;
        } catch (e) {
          errorDetails = { rawError: "Failed to stringify non-Error object" };
          errorMessage = "An un-stringifiable error object was caught.";
        }
      }

      throw new InternalServerErrorException({ error: errorMessage, details: errorDetails })

    } finally {
      if (logRef) {
        const endTime = performance.now();
        const durationMs = (endTime - startTime) / 1000; // Convert to seconds
        const updateData: Partial<ApiLog> = {
          durationMs,
        };

        if (errorOccurred) {
          updateData.status = "error";
          let errorDetails: any = {};
          if (capturedError instanceof Error) {
            errorDetails = {
              message: capturedError.message,
              stack: capturedError.stack,
            };
          } else {
            try {
              errorDetails = { rawError: JSON.stringify(capturedError, null, 2) };
            } catch {
              errorDetails = { rawError: "Unstringifiable error" };
            }
          }
          updateData.errorData = errorDetails;
        } else {
          updateData.status = "success";
          // Assuming success means we got 'evaluationResult'
          // We might want to add raw text logging here too if needed
          updateData.responseData = {
            // rawText: aiJsonText, // Uncomment if raw text needed
            parsedJson: evaluationResult, // Log the parsed result
          };
        }
        try {
          await this.apilogService.completeLog(logRef, updateData);
          this.logger.debug("API log completed successfully");
        } catch (logError) {
          this.logger.error("Failed to complete API log", logError);
        }
      }
    }
  }

  async generateLesson(
    userMessage: string, // prompt, if I have to clarify this with a comment...
    logContext?: Record<string, any>,
    cachedContentName?: string,
  ) {

    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: "/lessons/generate",
      status: "pending",
      modelUsed: this.modelName,
      requestData: {
        userMessage: userMessage, // Log the core data
        content: logContext?.content,
        kuId: logContext?.kuId,
      },
    };

    const logRef = await this.apilogService.startLog(initialLogData);
    let startTime = performance.now();
    let errorOccurred = false;
    let capturedError: any;
    let text: string | undefined; // Capture raw text for logging
    let lessonString: string | undefined;

    if (logContext?.content) {
      this.logger.log(`Generating lesson for content: "${logContext.content}" (Cache: ${cachedContentName || 'None'})`);
    }

    try {
      const apiResponse = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ parts: [{ text: userMessage }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.4,
          cachedContent: cachedContentName,
        }
      });

      if (!apiResponse || !apiResponse?.text) throw new Error("AI response was empty.");

      // --- NEW DEFENSIVE PARSING ---
      lessonString = apiResponse.text;

      // Find the first '{' and the last '}'
      // This will cut out all the "Chain of Thought" text before the JSON.
      const jsonStart = lessonString.indexOf("{");
      const jsonEnd = lessonString.lastIndexOf("}");

      if (jsonStart !== -1 && jsonEnd !== -1) {
        lessonString = lessonString.substring(jsonStart, jsonEnd + 1);
      } else {
        // If no brackets, it's definitely not JSON
        this.logger.error("AI response did not contain a valid JSON object.", {
          rawText: text,
        });
        throw new Error("AI response did not contain a valid JSON object.");
      }

      if (logContext?.content) {
        this.logger.log(`Successfully generated lesson for "${logContext.content}"`);
      }
      return lessonString;

    } catch (error) {
      errorOccurred = true;
      capturedError = error;

      this.logger.error('Gemini Service Error:', error);

      let errorDetails: any = {};
      let errorMessage = "An unknown error occurred";

      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = {
          message: error.message,
          name: error.name,
          stack: error.stack,
        };
        if (
          error.message.includes("fetch") ||
          error.message.includes("network")
        ) {
          errorMessage = `Network error during API call: ${error.message}`;
        }
      } else {
        try {
          errorDetails = { rawError: JSON.stringify(error, null, 2) };
          errorMessage = `Non-Error exception: ${errorDetails.rawError}`;
        } catch (e) {
          errorDetails = { rawError: "Failed to stringify non-Error object" };
          errorMessage = "An un-stringifiable error object was caught.";
        }
      }

      throw new InternalServerErrorException({ error: errorMessage, details: errorDetails })
    } finally {
      if (logRef) {
        const endTime = performance.now();
        const durationMs = (endTime - startTime) / 1000; // Convert to seconds
        const updateData: Partial<ApiLog> = {
          durationMs,
        };

        if (errorOccurred) {
          updateData.status = "error";
          let errorDetails: any = {};
          if (capturedError instanceof Error) {
            errorDetails = {
              message: capturedError.message,
              stack: capturedError.stack,
            };
          } else {
            try {
              errorDetails = { rawError: JSON.stringify(capturedError, null, 2) };
            } catch {
              errorDetails = { rawError: "Unstringifiable error" };
            }
          }
          updateData.errorData = errorDetails;
        } else {
          updateData.status = "success"
          updateData.responseData = {
            parsedJson: lessonString || null,
          };
        }
        try {
          await this.apilogService.completeLog(logRef, updateData);
          this.logger.debug("API log completed successfully");
        } catch (logError) {
          this.logger.error("Failed to complete API log", logError);
        }
      }
    }

  }

  // ... existing imports ...
  // ... existing class definition ...

  async generateScenario(userMessage: string) {
    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: "/scenarios/generate",
      status: "pending",
      modelUsed: this.modelName,
      requestData: {
        userMessage: userMessage,
      },
    };

    const logRef = await this.apilogService.startLog(initialLogData);
    let startTime = performance.now();
    let errorOccurred = false;
    let capturedError: any;
    let scenarioString: string | undefined;

    try {
      const apiResponse = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ parts: [{ text: userMessage }] }],
        config: {
          responseMimeType: "application/json",
          temperature: 0.4,
        }
      });

      if (!apiResponse || !apiResponse?.text) throw new Error("AI response was empty.");

      // Defensive Parsing
      scenarioString = apiResponse.text;
      const jsonStart = scenarioString.indexOf("{");
      const jsonEnd = scenarioString.lastIndexOf("}");

      if (jsonStart !== -1 && jsonEnd !== -1) {
        scenarioString = scenarioString.substring(jsonStart, jsonEnd + 1);
      } else {
        this.logger.error("AI response did not contain a valid JSON object.", { rawText: scenarioString });
        throw new Error("AI response did not contain a valid JSON object.");
      }

      return scenarioString;

    } catch (error) {
      errorOccurred = true;
      capturedError = error;
      this.logger.error('Gemini Service Error (Scenario):', error);

      // Re-throw appropriate exception (simplified from generateLesson for brevity, acts the same)
      throw new InternalServerErrorException("Failed to generate scenario");
    } finally {
      if (logRef) {
        const endTime = performance.now();
        const durationMs = (endTime - startTime) / 1000;

        // FIX: Initialize with safe values only. Do not explicitly set keys to undefined.
        const updateData: Partial<ApiLog> = {
          durationMs,
          status: errorOccurred ? "error" : "success",
        };

        if (errorOccurred) {
          updateData.errorData = { message: capturedError?.message };
        } else {
          updateData.responseData = { parsedJson: scenarioString || null };
        }

        try {
          await this.apilogService.completeLog(logRef, updateData);
        } catch (logError) {
          this.logger.error("Failed to complete API log", logError);
        }
      }
    }
  }

  async generateQuestionAI(
    userMessage: string,
    systemPrompt: string,
    logContext?: Record<string, any>
  ) {
    let startTime = performance.now();
    let errorOccurred = false;
    let capturedError: any;
    let aiJsonText: string | undefined; // Capture raw text for logging
    let parsedJson: {
      question: string;
      answer: string;
      context?: string;
      accepted_alternatives?: string[];
    } | undefined; // Capture parsed result

    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: "/questions/generate",
      status: "pending",
      modelUsed: this.modelName,
      requestData: {
        userMessage: userMessage, // Log the core data
        systemPrompt: systemPrompt,
      },
    };

    const logRef = await this.apilogService.startLog(initialLogData);


    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              question: { type: "STRING" },
              context: { type: "STRING" },
              answer: { type: "STRING" },
              accepted_alternatives: {
                type: "ARRAY",
                items: { type: "STRING" },
              },
            },
            required: ["question", "answer"],
          },
        },
      })

      // 3. Extract text using the SDK's helper method
      aiJsonText = response.text;

      if (!aiJsonText) {
        this.logger.error("Empty response text from Gemini API", { response });
        throw new Error("Invalid response structure from Gemini");
      }

      return aiJsonText; // Success

    } catch (error) {
      errorOccurred = true;
      capturedError = error;

      this.logger.error('Gemini Service Error:', error);

      let errorDetails: any = {};
      let errorMessage = "An unknown error occurred";

      if (error instanceof Error) {
        errorMessage = error.message;
        errorDetails = {
          message: error.message,
          name: error.name,
          stack: error.stack,
        };
        if (
          error.message.includes("fetch") ||
          error.message.includes("network")
        ) {
          errorMessage = `Network error during API call: ${error.message}`;
        }
      } else {
        try {
          errorDetails = { rawError: JSON.stringify(error, null, 2) };
          errorMessage = `Non-Error exception: ${errorDetails.rawError}`;
        } catch (e) {
          errorDetails = { rawError: "Failed to stringify non-Error object" };
          errorMessage = "An un-stringifiable error object was caught.";
        }
      }

      throw new InternalServerErrorException({ error: errorMessage, details: errorDetails })
    } finally {
      // --- Update Log Entry ---
      if (logRef) {
        const endTime = performance.now();
        const durationMs = endTime - startTime;
        const updateData: Partial<ApiLog> = { durationMs };

        if (errorOccurred) {
          updateData.status = "error";
          let errorDetails: any = {};
          if (capturedError instanceof Error) {
            errorDetails = {
              message: capturedError.message,
              stack: capturedError.stack,
            };
          } else {
            try {
              errorDetails = { rawError: JSON.stringify(capturedError, null, 2) };
            } catch {
              errorDetails = { rawError: "Unstringifiable error" };
            }
          }
          updateData.errorData = errorDetails;
        } else {
          updateData.status = "success";
          updateData.responseData = {
            rawText: aiJsonText, // Log raw text on success
            parsedJson: aiJsonText, // TODO: We're not parsing the JSON here so need to figure this out
          };
        }

        try {
          await logRef.update(updateData);
          this.logger.debug(`Updated log entry: ${logRef.id}`);
        } catch (error) {
          const logUpdateError = error as Error & { code?: string };
          this.logger.error(`Failed to update log entry ${logRef.id}`, {
            errorMessage: logUpdateError.message,
            errorCode: logUpdateError.code,
            errorStack: logUpdateError.stack,
          });
        }
      }
      // --- End Log ---
    }// end try/catch

  } // end generateQuestion

  async generateKanjiDetails(kanji: string) {
    const systemPrompt = `You are a Japanese Kanji expert. Provide metadata for the kanji: ${kanji}.`;
    const userMessage = `Generate a valid JSON object matching the Kanji Alive API structure for the character ${kanji}.`;

    const schema = {
      type: 'OBJECT',
      properties: {
        kanji: {
          type: 'OBJECT',
          properties: {
            meaning: { type: 'OBJECT', properties: { english: { type: 'STRING' } } },
            strokes: { type: 'OBJECT', properties: { count: { type: 'INTEGER' }, images: { type: 'ARRAY', items: { type: 'STRING' } } } },
            onyomi: { type: 'OBJECT', properties: { katakana: { type: 'STRING' } } },
            kunyomi: { type: 'OBJECT', properties: { hiragana: { type: 'STRING' } } },
          }
        },
        radical: {
          type: 'OBJECT',
          properties: {
            character: { type: 'STRING' },
            meaning: { type: 'OBJECT', properties: { english: { type: 'STRING' } } },
            image: { type: 'STRING' }
          }
        }
      },
      required: ['kanji', 'radical']
    };

    let startTime = performance.now();
    let errorOccurred = false;
    let capturedError: any;
    let aiJsonText: string | undefined;
    let parsedJson: any;

    const initialLogData: ApiLog = {
      timestamp: new Date(), // using Date for now, assume conversion handled by service
      route: 'gemini-generate-kanji',
      status: "pending",
      modelUsed: this.modelName,
      requestData: {
        userMessage,
        systemPrompt,
        topic: kanji,
        source: 'kanji-fallback'
      },
    };

    const logRef = await this.apilogService.startLog(initialLogData);

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ parts: [{ text: userMessage }] }],
        config: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          systemInstruction: { parts: [{ text: systemPrompt }] },
        },
      });

      if (!response) throw new Error('No response from Gemini');

      aiJsonText = response.text;
      if (!aiJsonText) throw new Error('Empty response text from Gemini');

      parsedJson = JSON.parse(aiJsonText);
      return parsedJson;

    } catch (error: any) {
      errorOccurred = true;
      capturedError = error;
      throw error;
    } finally {
      if (logRef) {
        const endTime = performance.now();
        const durationMs = endTime - startTime;

        const updateData: any = { durationMs };

        if (errorOccurred) {
          updateData.status = 'error';
          updateData.errorData = { message: capturedError?.message || 'Unknown error' };
        } else {
          updateData.status = 'success';
          updateData.responseData = {
            rawText: aiJsonText,
            parsedJson: parsedJson
          };
        }

        this.apilogService.completeLog(logRef, updateData).catch(err =>
          console.error('Failed to update log', err)
        );
      }
    }
  }
  async createContextCache(
    content: string,
    ttlSeconds: number = 3600,
  ): Promise<string> {
    try {
      // @google/genai SDK format for cache creation
      // Note: The SDK might store caches under `client.caches`
      const cacheResponse = await this.client.caches.create({
        model: this.modelName,
        config: {
          systemInstruction: {
            parts: [{ text: content }],
          },
          ttl: `${ttlSeconds}s`,
        },
      });

      this.logger.log(`Created context cache: ${cacheResponse.name}`);
      if (!cacheResponse.name) {
        throw new Error("Context cache creation returned empty name");
      }
      return cacheResponse.name;
    } catch (error) {
      this.logger.error('Failed to create context cache', error);
      throw error;
    }
  }

  async deleteContextCache(name: string): Promise<void> {
    try {
      await this.client.caches.delete({ name });
      this.logger.log(`Deleted context cache: ${name}`);
    } catch (error) {
      // It's possible the cache expired or was already deleted
      this.logger.warn(`Failed to delete context cache ${name}`, error);
    }
  }

  async generateChatResponse(
    systemPrompt: string,
    userMessage: string,
    logContext?: Record<string, any>
  ) {
    let startTime = performance.now();
    let errorOccurred = false;
    let capturedError: any;
    let aiJsonText: string | undefined;
    let parsedJson: {
      message: string;
      speaker: string;
      correction?: string;
      sceneFinished?: boolean;
    } | undefined;

    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: "/scenarios/chat",
      status: "pending",
      modelUsed: this.modelName,
      requestData: {
        userMessage: userMessage,
        systemPrompt: systemPrompt,
        input_topic: logContext?.topic,
        kuId: logContext?.scenarioId,
      },
    };

    const logRef = await this.apilogService.startLog(initialLogData);

    try {
      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ parts: [{ text: userMessage }] }],
        config: {
          systemInstruction: { parts: [{ text: systemPrompt }] },
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              message: { type: "STRING" },
              speaker: { type: "STRING" },
              correction: { type: "STRING", nullable: true },
              sceneFinished: { type: "BOOLEAN", nullable: true },
            },
            required: ["message", "speaker"],
          },
        },
      });

      aiJsonText = response.text;

      if (!aiJsonText) {
        throw new Error("Empty response text from Gemini API");
      }

      parsedJson = JSON.parse(aiJsonText);
      return parsedJson;

    } catch (error) {
      errorOccurred = true;
      capturedError = error;
      this.logger.error('Gemini Service Chat Error:', error);
      throw new InternalServerErrorException("Failed to generate chat response");
    } finally {
      if (logRef) {
        const endTime = performance.now();
        const durationMs = (endTime - startTime) / 1000;
        const updateData: Partial<ApiLog> = {
          durationMs,
          status: errorOccurred ? "error" : "success",
        };

        if (errorOccurred) {
          updateData.errorData = {
            message: capturedError instanceof Error ? capturedError.message : String(capturedError)
          };
        } else {
          updateData.responseData = {
            rawText: aiJsonText,
            parsedJson: parsedJson,
          };
        }

        try {
          await this.apilogService.completeLog(logRef, updateData);
        } catch (logError) {
          this.logger.error("Failed to complete API log", logError);
        }
      }
    }
  }

  async evaluateScenario(
    chatHistory: { speaker: string; text: string }[],
    scenarioContext: { title: string; goal: string; difficulty: string; userRole?: string; aiRole?: string; isObjectiveMet: boolean }
  ): Promise<ScenarioEvaluation> {
    let startTime = performance.now();
    let errorOccurred = false;
    let capturedError: any;
    let aiJsonText: string | undefined;
    let parsedJson: ScenarioEvaluation | undefined;

    const initialLogData: ApiLog = {
      timestamp: Timestamp.now(),
      route: "/scenarios/evaluate",
      status: "pending",
      modelUsed: this.modelName,
      requestData: {
        scenarioContext,
        historyLength: chatHistory.length,
        userMessage: "Scenario Evaluation", // Required by interface
      },
    };

    const logRef = await this.apilogService.startLog(initialLogData);

    try {
      // Improved Transcript Formatting

      const historyText = chatHistory.map((m) => {
        const roleLabel = m.speaker === scenarioContext.userRole ? `[User - ${m.speaker}]` : `[AI - ${m.speaker}]`;
        return `${roleLabel}: ${m.text}`;
      }).join("\n");

      const prompt = `
        Act as a strict Japanese language teacher.
        Evaluate this Roleplay Session based on:
        1. Did they achieve the Goal? (success: true/false): (${scenarioContext.goal})
        2. Grammar/Vocabulary Usage (Level ${scenarioContext.difficulty})
        3. Rate naturalness (1-5).
        4. Provide specific feedback in English.
        5. Identify 1-3 critical mistakes.

        SCENARIO CONTEXT:
        - Title: ${scenarioContext.title}
        - Goal: ${scenarioContext.goal}
        - User Role: ${scenarioContext.userRole || 'User'} (The person being evaluated)
        - AI Role: ${scenarioContext.aiRole || 'AI'} (The conversation partner)
        - OBJECTIVE MET: ${scenarioContext.isObjectiveMet}

        TRANSCRIPT:
        ${historyText}

        **CRITICAL GRADING RULES:**
        1. **Output Language:** Write the 'feedback' and 'explanation' fields in **ENGLISH ONLY**. Do not use Japanese for the report text.
        2. **Failure Condition:** If 'OBJECTIVE MET' is 'NO', the 'success' field MUST be false, and the 'rating' MUST be 1 or 2 (Fail). Do not give high ratings for incomplete work.
        3. **Success Condition:** If 'OBJECTIVE MET' is 'YES', grade based on naturalness and grammar.

        INSTRUCTION: Evaluate the USER (${scenarioContext.userRole || 'User'}) based on how well they achieved the goal. Do not confuse the User's responses with the AI's responses. 
        OUTPUT LANGUAGE: the feedback and explanation must be in English. Do not write the report in Japanese but do not translate the user's or AI's responses.
        
        Provide a structured evaluation in JSON using the attached schema.
      `;

      // LOG PROMPT for debugging
      console.log('--- SCENARIO EVALUATION PROMPT ---');
      console.log(prompt);
      console.log('----------------------------------');

      const response = await this.client.models.generateContent({
        model: this.modelName,
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "OBJECT",
            properties: {
              success: { type: "BOOLEAN" },
              rating: { type: "INTEGER", description: "1-5 stars" },
              feedback: { type: "STRING" },
              corrections: {
                type: "ARRAY",
                items: {
                  type: "OBJECT",
                  properties: {
                    original: { type: "STRING" },
                    correction: { type: "STRING" },
                    explanation: { type: "STRING" },
                  },
                },
              },
            },
            required: ["success", "rating", "feedback", "corrections"],
          },
        },
      });

      aiJsonText = response.text;
      if (!aiJsonText) throw new Error("Empty response from AI");

      parsedJson = JSON.parse(aiJsonText) as ScenarioEvaluation;
      return parsedJson;

    } catch (error) {
      errorOccurred = true;
      capturedError = error;
      this.logger.error("Scenario Evaluation Failed", error);
      throw new InternalServerErrorException("Failed to evaluate scenario");
    } finally {
      if (logRef) {
        const endTime = performance.now();
        const updateData: Partial<ApiLog> = {
          durationMs: (endTime - startTime) / 1000,
          status: errorOccurred ? "error" : "success",
        };
        if (errorOccurred) {
          updateData.errorData = { message: String(capturedError) };
        } else {
          updateData.responseData = { parsedJson };
        }
        await this.apilogService.completeLog(logRef, updateData).catch(e => this.logger.error(e));
      }
    }
  }
}
