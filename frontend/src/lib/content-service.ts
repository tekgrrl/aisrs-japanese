import fs from 'fs';
import path from 'path';
import matter from 'gray-matter';
import { KnowledgeUnitType } from '@/types';

// --- Data Shapes ---

export interface TopicMetadata {
  id: string;
  type: KnowledgeUnitType;
  content: string;
  reading?: string;
  definition?: string;
  partOfSpeech?: string;
  conjugationType?: string;
  grammarFunction?: string;
  linkagePattern?: string;
  isStructural?: boolean;
  kanjiFormat?: string;

  relatedUnits?: string[];
  availableLessons?: string[];
  contextualSentences?: string[];
  components?: any[];
}

export interface LessonContent {
  id: string;
  topicId: string;
  title?: string;
  body: string;
  content?: string;
  partOfSpeech?: string;
}

export interface ContextExample {
  id: string;
  type: 'sentence';
  title?: string;
  translation: string;
  content: string;
  contextualFor?: string[];
  kanjiFormat?: string;
  tags?: string[];
  body?: string;
}

// --- Service Contract ---

export interface ContentService {
  getTopic(id: string): Promise<TopicMetadata | null>;
  getLesson(id: string): Promise<LessonContent | null>;
  getSentence(id: string): Promise<ContextExample | null>;
  getAllTopics(type?: KnowledgeUnitType): Promise<TopicMetadata[]>;
  getLessonsForTopic(topicId: string): Promise<LessonContent[]>;
  getSentencesForTopic(topicId: string): Promise<ContextExample[]>;
}

// --- File System Implementation ---

class FileSystemContentService implements ContentService {
  private contentDir: string;
  private indexCache: Map<string, { filePath: string; type: 'topic' | 'lesson' | 'sentence' }> | null = null;

  constructor() {
    this.contentDir = path.join(process.cwd(), '../content');
  }

  /**
   * Scans the content directory to build an index of ID -> FilePath.
   */
  private async getIndex() {
    if (this.indexCache) return this.indexCache;

    const index = new Map<string, { filePath: string; type: 'topic' | 'lesson' | 'sentence' }>();

    // Refactored to manual recursion to avoid Node version/Type issues with 'recursive: true'
    const scanDir = (dir: string, type: 'topic' | 'lesson' | 'sentence') => {
      if (!fs.existsSync(dir)) return;

      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath, type);
        } else if (entry.isFile() && entry.name.endsWith('.md')) {
          try {
            // Only read the file to check the ID
            const fileContent = fs.readFileSync(fullPath, 'utf8');
            const { data } = matter(fileContent);
            if (data.id) {
              index.set(data.id, { filePath: fullPath, type });
            } else {
              console.error(`No ID found in frontmatter for ${fullPath}`);
            }
          } catch (e) {
            console.error(`Failed to parse frontmatter for ${fullPath}`, e);
          }
        }
      }
    };

    scanDir(path.join(this.contentDir, 'topics'), 'topic');
    scanDir(path.join(this.contentDir, 'lessons'), 'lesson');
    scanDir(path.join(this.contentDir, 'contextExamples'), 'sentence');

    this.indexCache = index;
    return index;
  }

  private async readFile<T>(id: string, expectedType: 'topic' | 'lesson' | 'sentence'): Promise<T | null> {
    const index = await this.getIndex();
    const entry = index.get(id);

    if (!entry || entry.type !== expectedType) return null;

    const fileContent = fs.readFileSync(entry.filePath, 'utf8');
    const { data, content } = matter(fileContent);

    // Always return body content combined with frontmatter
    return { ...data, body: content } as unknown as T;
  }

  // --- 1. Core Retrieval ---

  async getTopic(id: string): Promise<TopicMetadata | null> {
    return this.readFile<TopicMetadata>(id, 'topic');
  }

  async getLesson(id: string): Promise<LessonContent | null> {
    return this.readFile<LessonContent>(id, 'lesson');
  }

  async getSentence(id: string): Promise<ContextExample | null> {
    return this.readFile<ContextExample>(id, 'sentence');
  }

  // --- 2. Collections ---

  async getAllTopics(type?: KnowledgeUnitType): Promise<TopicMetadata[]> {
    const index = await this.getIndex();
    const topics: TopicMetadata[] = [];

    for (const [id, entry] of index.entries()) {
      if (entry.type === 'topic') {
        const topic = await this.getTopic(id);
        if (topic) {
          // Optional filtering by KU type (Vocab, Grammar, etc)
          if (!type || topic.type === type) {
            topics.push(topic);
          }
        }
      }
    }
    return topics;
  }

  // --- 3. Relationship Resolvers ---

  async getLessonsForTopic(topicId: string): Promise<LessonContent[]> {
    const topic = await this.getTopic(topicId);
    const linkedLessonIds = topic?.availableLessons || [];

    const lessons: LessonContent[] = [];

    // 1. Explicit links from Topic
    for (const id of linkedLessonIds) {
      const lesson = await this.getLesson(id);
      if (lesson) lessons.push(lesson);
    }

    // 2. Back-links from Lessons (Scanning)
    const index = await this.getIndex();
    for (const [id, entry] of index.entries()) {
      if (entry.type === 'lesson' && !linkedLessonIds.includes(id)) {
        const lesson = await this.getLesson(id);
        if (lesson && lesson.topicId === topicId) {
          lessons.push(lesson);
        }
      }
    }

    return lessons;
  }

  async getSentencesForTopic(topicId: string): Promise<ContextExample[]> {
    const topic = await this.getTopic(topicId);
    const linkedSentenceIds = topic?.contextualSentences || [];

    const sentences: ContextExample[] = [];
    const seenIds = new Set<string>();

    // 1. Explicit links from Topic
    for (const id of linkedSentenceIds) {
      const s = await this.getSentence(id);
      if (s) {
        sentences.push(s);
        seenIds.add(s.id);
      }
    }

    // 2. Back-links from Sentences (Scanning)
    const index = await this.getIndex();
    for (const [id, entry] of index.entries()) {
      if (entry.type === 'sentence' && !seenIds.has(id)) {
        const s = await this.getSentence(id);
        if (s && s.contextualFor && s.contextualFor.includes(topicId)) {
          sentences.push(s);
        }
      }
    }

    return sentences;
  }
}

export const contentService = new FileSystemContentService();