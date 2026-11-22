import { useCallback, useEffect, useState } from 'react';
import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
  deleteDoc,
} from 'firebase/firestore';
import { onAuthStateChanged, signInWithPopup, signOut, type User } from 'firebase/auth';
import { auth, db, googleProvider, handleFirestoreError, OperationType } from '../firebase';
import { DEFAULT_API_BASE_URL, DEFAULT_MODEL } from '../constants/languages';
import {
  FIELD_LIMITS,
  type Chapter,
  type ChapterStatus,
  type GlossaryCategory,
  type GlossaryTerm,
  type Novel,
  type Segment,
  type ThemeMode,
  type UserSettings,
} from '../types';

function makeId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 10);
  const time = Date.now().toString(36);
  return `${prefix}_${time}_${rand}`;
}

export function useFirestoreData() {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [settings, setSettings] = useState<UserSettings>({
    ownerId: '',
    apiBaseUrl: DEFAULT_API_BASE_URL,
    apiModel: DEFAULT_MODEL,
    theme: 'light',
  });
  const [hasSettingsDoc, setHasSettingsDoc] = useState(false);

  const [novels, setNovels] = useState<Novel[]>([]);
  const [novelsLoading, setNovelsLoading] = useState(true);
  const [activeNovelId, setActiveNovelId] = useState<string | null>(null);

  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [chaptersLoading, setChaptersLoading] = useState(false);
  const [activeChapterId, setActiveChapterId] = useState<string | null>(null);

  const [segments, setSegments] = useState<Segment[]>([]);
  const [segmentsLoading, setSegmentsLoading] = useState(false);

  const [glossary, setGlossary] = useState<GlossaryTerm[]>([]);
  const [glossaryLoading, setGlossaryLoading] = useState(false);

  // Auth listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (nextUser) => {
      setUser(nextUser);
      setAuthReady(true);
      if (!nextUser) {
        setNovels([]);
        setChapters([]);
        setSegments([]);
        setGlossary([]);
        setActiveNovelId(null);
        setActiveChapterId(null);
        setNovelsLoading(false);
      }
    });
    return () => unsub();
  }, []);

  // User settings listener
  useEffect(() => {
    if (!authReady || !user) return;
    const settingsPath = `userSettings/${user.uid}`;
    const ref = doc(db, 'userSettings', user.uid);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as UserSettings;
          setSettings(data);
          setHasSettingsDoc(true);
        } else {
          setHasSettingsDoc(false);
          setSettings((prev) => ({
            ...prev,
            ownerId: user.uid,
            apiBaseUrl: prev.apiBaseUrl || DEFAULT_API_BASE_URL,
            apiModel: prev.apiModel || DEFAULT_MODEL,
          }));
        }
      },
      (error) => handleFirestoreError(error, OperationType.GET, settingsPath)
    );
    return () => unsub();
  }, [authReady, user]);

  // Novels listener (query filtered by ownerId; sorted client-side to avoid composite indexes)
  useEffect(() => {
    if (!authReady || !user) return;
    setNovelsLoading(true);
    const path = 'novels';
    const q = query(collection(db, path), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Novel, 'id'>) }));
        list.sort((a, b) => {
          const tA = a.updatedAt?.toMillis?.() ?? 0;
          const tB = b.updatedAt?.toMillis?.() ?? 0;
          return tB - tA;
        });
        setNovels(list);
        setNovelsLoading(false);
        setActiveNovelId((curr) => {
          if (curr && list.some((n) => n.id === curr)) return curr;
          return list[0]?.id || null;
        });
      },
      (error) => handleFirestoreError(error, OperationType.LIST, path)
    );
    return () => unsub();
  }, [authReady, user]);

  // Chapters & Glossary listeners for active novel
  useEffect(() => {
    if (!authReady || !user || !activeNovelId) {
      setChapters([]);
      setGlossary([]);
      setActiveChapterId(null);
      return;
    }

    setChaptersLoading(true);
    setGlossaryLoading(true);

    const chaptersPath = `novels/${activeNovelId}/chapters`;
    const chaptersQ = query(collection(db, chaptersPath), where('ownerId', '==', user.uid));
    const unsubChapters = onSnapshot(
      chaptersQ,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Chapter, 'id'>) }));
        list.sort((a, b) => a.order - b.order);
        setChapters(list);
        setChaptersLoading(false);
        setActiveChapterId((curr) => {
          if (curr && list.some((c) => c.id === curr)) return curr;
          return list[0]?.id || null;
        });
      },
      (error) => handleFirestoreError(error, OperationType.LIST, chaptersPath)
    );

    const glossaryPath = `novels/${activeNovelId}/glossaries`;
    const glossaryQ = query(collection(db, glossaryPath), where('ownerId', '==', user.uid));
    const unsubGlossary = onSnapshot(
      glossaryQ,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<GlossaryTerm, 'id'>) }));
        list.sort((a, b) => a.sourceTerm.localeCompare(b.sourceTerm));
        setGlossary(list);
        setGlossaryLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, glossaryPath)
    );

    return () => {
      unsubChapters();
      unsubGlossary();
    };
  }, [authReady, user, activeNovelId]);

  // Segments listener for active chapter
  useEffect(() => {
    if (!authReady || !user || !activeNovelId || !activeChapterId) {
      setSegments([]);
      return;
    }
    setSegmentsLoading(true);
    const segPath = `novels/${activeNovelId}/chapters/${activeChapterId}/segments`;
    const q = query(collection(db, segPath), where('ownerId', '==', user.uid));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Segment, 'id'>) }));
        list.sort((a, b) => a.index - b.index);
        setSegments(list);
        setSegmentsLoading(false);
      },
      (error) => handleFirestoreError(error, OperationType.LIST, segPath)
    );
    return () => unsub();
  }, [authReady, user, activeNovelId, activeChapterId]);

  // Auth Actions
  const handleSignIn = useCallback(async () => {
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Đăng nhập thất bại.';
      setAuthError(msg);
    }
  }, []);

  const handleSignOut = useCallback(async () => {
    await signOut(auth);
  }, []);

  // Settings Actions
  const saveUserSettings = useCallback(
    async (partial: { apiBaseUrl?: string; apiModel?: string; theme?: ThemeMode }) => {
      const next: UserSettings = {
        ownerId: user?.uid || '',
        apiBaseUrl: (partial.apiBaseUrl ?? settings.apiBaseUrl ?? DEFAULT_API_BASE_URL)
          .trim()
          .slice(0, FIELD_LIMITS.API_URL_MAX),
        apiModel: (partial.apiModel ?? settings.apiModel ?? DEFAULT_MODEL)
          .trim()
          .slice(0, FIELD_LIMITS.API_MODEL_MAX) || DEFAULT_MODEL,
        theme: partial.theme ?? settings.theme ?? 'light',
      };
      setSettings(next);

      if (!user) return;
      const path = `userSettings/${user.uid}`;
      const ref = doc(db, 'userSettings', user.uid);
      try {
        if (hasSettingsDoc) {
          await updateDoc(ref, {
            apiBaseUrl: next.apiBaseUrl,
            apiModel: next.apiModel,
            theme: next.theme,
            updatedAt: serverTimestamp(),
          });
        } else {
          await setDoc(ref, {
            ownerId: user.uid,
            apiBaseUrl: next.apiBaseUrl,
            apiModel: next.apiModel,
            theme: next.theme,
            updatedAt: serverTimestamp(),
          });
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user, settings, hasSettingsDoc]
  );

  // Novel CRUD
  const createNovel = useCallback(
    async (input: {
      title: string;
      author: string;
      sourceLang: string;
      targetLang: string;
      styleInstruction: string;
    }): Promise<string> => {
      if (!user) throw new Error('Chưa đăng nhập.');
      const novelId = makeId('novel');
      const path = `novels/${novelId}`;
      try {
        await setDoc(doc(db, 'novels', novelId), {
          ownerId: user.uid,
          title: input.title.trim().slice(0, FIELD_LIMITS.NOVEL_TITLE_MAX) || 'Tiểu thuyết mới',
          author: input.author.trim().slice(0, FIELD_LIMITS.NOVEL_AUTHOR_MAX),
          sourceLang: input.sourceLang.slice(0, 32) || 'zh',
          targetLang: input.targetLang.slice(0, 32) || 'vi',
          styleInstruction: input.styleInstruction.trim().slice(0, FIELD_LIMITS.STYLE_INSTRUCTION_MAX),
          chapterCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setActiveNovelId(novelId);
        return novelId;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [user]
  );

  const updateNovel = useCallback(
    async (
      novelId: string,
      input: {
        title: string;
        author: string;
        sourceLang: string;
        targetLang: string;
        styleInstruction: string;
      }
    ) => {
      if (!user) return;
      const path = `novels/${novelId}`;
      try {
        await updateDoc(doc(db, 'novels', novelId), {
          title: input.title.trim().slice(0, FIELD_LIMITS.NOVEL_TITLE_MAX) || 'Tiểu thuyết mới',
          author: input.author.trim().slice(0, FIELD_LIMITS.NOVEL_AUTHOR_MAX),
          sourceLang: input.sourceLang.slice(0, 32) || 'zh',
          targetLang: input.targetLang.slice(0, 32) || 'vi',
          styleInstruction: input.styleInstruction.trim().slice(0, FIELD_LIMITS.STYLE_INSTRUCTION_MAX),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const deleteNovel = useCallback(
    async (novelId: string) => {
      if (!user) return;
      const path = `novels/${novelId}`;
      try {
        // Clean up subcollections in chunks
        const glossSnap = await getDocs(
          query(collection(db, `novels/${novelId}/glossaries`), where('ownerId', '==', user.uid))
        );
        const chapSnap = await getDocs(
          query(collection(db, `novels/${novelId}/chapters`), where('ownerId', '==', user.uid))
        );

        const refsToDelete = [...glossSnap.docs.map((d) => d.ref)];
        for (const chDoc of chapSnap.docs) {
          const segSnap = await getDocs(
            query(
              collection(db, `novels/${novelId}/chapters/${chDoc.id}/segments`),
              where('ownerId', '==', user.uid)
            )
          );
          refsToDelete.push(...segSnap.docs.map((d) => d.ref), chDoc.ref);
        }

        for (let i = 0; i < refsToDelete.length; i += 400) {
          const batch = writeBatch(db);
          refsToDelete.slice(i, i + 400).forEach((ref) => batch.delete(ref));
          await batch.commit();
        }

        await deleteDoc(doc(db, 'novels', novelId));
        if (activeNovelId === novelId) {
          setActiveNovelId(null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user, activeNovelId]
  );

  // Chapter & Segments CRUD
  const createChapterWithSegments = useCallback(
    async (
      novelId: string,
      input: {
        titleSource: string;
        titleTranslated?: string;
        paragraphs: string[];
        order?: number;
      }
    ): Promise<string> => {
      if (!user) throw new Error('Chưa đăng nhập.');
      const chapterId = makeId('chap');
      const chapterPath = `novels/${novelId}/chapters/${chapterId}`;
      const paragraphs = input.paragraphs
        .map((p) => p.trim().slice(0, FIELD_LIMITS.SEGMENT_SOURCE_MAX))
        .filter((p) => p.length > 0)
        .slice(0, 5000);

      const nextOrder = input.order ?? chapters.length + 1;

      try {
        const firstBatch = writeBatch(db);
        const chapterRef = doc(db, 'novels', novelId, 'chapters', chapterId);
        firstBatch.set(chapterRef, {
          ownerId: user.uid,
          novelId,
          order: Math.max(1, nextOrder),
          titleSource: input.titleSource.trim().slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX) || `Chương ${nextOrder}`,
          titleTranslated: (input.titleTranslated || '').trim().slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX),
          status: 'draft' as ChapterStatus,
          segmentCount: paragraphs.length,
          translatedCount: 0,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const firstChunk = paragraphs.slice(0, 380);
        firstChunk.forEach((sourceText, idx) => {
          const segId = `seg_${String(idx).padStart(4, '0')}_${Math.random().toString(36).slice(2, 6)}`;
          const segRef = doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', segId);
          firstBatch.set(segRef, {
            ownerId: user.uid,
            novelId,
            chapterId,
            index: idx,
            sourceText,
            translatedText: '',
            note: '',
            isReviewed: false,
            updatedAt: serverTimestamp(),
          });
        });

        await firstBatch.commit();

        // Remaining segments if chapter > 380 paragraphs
        for (let offset = 380; offset < paragraphs.length; offset += 400) {
          const batch = writeBatch(db);
          paragraphs.slice(offset, offset + 400).forEach((sourceText, localIdx) => {
            const idx = offset + localIdx;
            const segId = `seg_${String(idx).padStart(4, '0')}_${Math.random().toString(36).slice(2, 6)}`;
            const segRef = doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', segId);
            batch.set(segRef, {
              ownerId: user.uid,
              novelId,
              chapterId,
              index: idx,
              sourceText,
              translatedText: '',
              note: '',
              isReviewed: false,
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }

        // Sync novel chapterCount
        const currentNovel = novels.find((n) => n.id === novelId);
        const newCount = Math.max((currentNovel?.chapterCount || 0) + 1, chapters.length + 1);
        await updateDoc(doc(db, 'novels', novelId), {
          chapterCount: newCount,
          updatedAt: serverTimestamp(),
        });

        setActiveChapterId(chapterId);
        return chapterId;
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, chapterPath);
      }
    },
    [user, chapters.length, novels]
  );

  const createMultipleChapters = useCallback(
    async (
      novelId: string,
      items: Array<{ titleSource: string; paragraphs: string[]; order: number }>
    ): Promise<string[]> => {
      if (!user || items.length === 0) return [];
      const createdIds: string[] = [];
      let baseCount = Math.max(
        novels.find((n) => n.id === novelId)?.chapterCount || 0,
        chapters.length
      );

      for (const item of items) {
        const chapterId = makeId('chap');
        const chapterPath = `novels/${novelId}/chapters/${chapterId}`;
        const paragraphs = item.paragraphs
          .map((p) => p.trim().slice(0, FIELD_LIMITS.SEGMENT_SOURCE_MAX))
          .filter((p) => p.length > 0)
          .slice(0, 5000);

        if (paragraphs.length === 0) continue;

        try {
          const firstBatch = writeBatch(db);
          const chapterRef = doc(db, 'novels', novelId, 'chapters', chapterId);
          firstBatch.set(chapterRef, {
            ownerId: user.uid,
            novelId,
            order: Math.max(1, item.order),
            titleSource:
              item.titleSource.trim().slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX) ||
              `Chương ${item.order}`,
            titleTranslated: '',
            status: 'draft' as ChapterStatus,
            segmentCount: paragraphs.length,
            translatedCount: 0,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });

          paragraphs.slice(0, 380).forEach((sourceText, idx) => {
            const segId = `seg_${String(idx).padStart(4, '0')}_${Math.random().toString(36).slice(2, 6)}`;
            const segRef = doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', segId);
            firstBatch.set(segRef, {
              ownerId: user.uid,
              novelId,
              chapterId,
              index: idx,
              sourceText,
              translatedText: '',
              note: '',
              isReviewed: false,
              updatedAt: serverTimestamp(),
            });
          });
          await firstBatch.commit();

          for (let offset = 380; offset < paragraphs.length; offset += 400) {
            const batch = writeBatch(db);
            paragraphs.slice(offset, offset + 400).forEach((sourceText, localIdx) => {
              const idx = offset + localIdx;
              const segId = `seg_${String(idx).padStart(4, '0')}_${Math.random().toString(36).slice(2, 6)}`;
              const segRef = doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', segId);
              batch.set(segRef, {
                ownerId: user.uid,
                novelId,
                chapterId,
                index: idx,
                sourceText,
                translatedText: '',
                note: '',
                isReviewed: false,
                updatedAt: serverTimestamp(),
              });
            });
            await batch.commit();
          }

          createdIds.push(chapterId);
          baseCount += 1;
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, chapterPath);
        }
      }

      if (createdIds.length > 0) {
        try {
          await updateDoc(doc(db, 'novels', novelId), {
            chapterCount: baseCount,
            updatedAt: serverTimestamp(),
          });
          setActiveChapterId(createdIds[0]);
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `novels/${novelId}`);
        }
      }

      return createdIds;
    },
    [user, chapters.length, novels]
  );

  const updateChapterMeta = useCallback(
    async (
      novelId: string,
      chapterId: string,
      fields: { titleTranslated?: string; status?: ChapterStatus; translatedCount?: number }
    ) => {
      if (!user) return;
      const path = `novels/${novelId}/chapters/${chapterId}`;
      try {
        const chapter = chapters.find((c) => c.id === chapterId);
        await updateDoc(doc(db, 'novels', novelId, 'chapters', chapterId), {
          titleTranslated: (fields.titleTranslated ?? chapter?.titleTranslated ?? '')
            .trim()
            .slice(0, FIELD_LIMITS.CHAPTER_TITLE_MAX),
          status: fields.status ?? chapter?.status ?? 'draft',
          translatedCount: fields.translatedCount ?? chapter?.translatedCount ?? 0,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user, chapters]
  );

  const deleteChapter = useCallback(
    async (novelId: string, chapterId: string) => {
      if (!user) return;
      const path = `novels/${novelId}/chapters/${chapterId}`;
      try {
        const segSnap = await getDocs(
          query(
            collection(db, `novels/${novelId}/chapters/${chapterId}/segments`),
            where('ownerId', '==', user.uid)
          )
        );
        for (let i = 0; i < segSnap.docs.length; i += 400) {
          const batch = writeBatch(db);
          segSnap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
          await batch.commit();
        }
        await deleteDoc(doc(db, 'novels', novelId, 'chapters', chapterId));

        const nextCount = Math.max(0, chapters.length - 1);
        await updateDoc(doc(db, 'novels', novelId), {
          chapterCount: nextCount,
          updatedAt: serverTimestamp(),
        });

        if (activeChapterId === chapterId) {
          setActiveChapterId(null);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user, chapters.length, activeChapterId]
  );

  // Segment updates
  const updateSegmentTranslation = useCallback(
    async (
      novelId: string,
      chapterId: string,
      segmentId: string,
      translatedText: string
    ) => {
      if (!user) return;
      const path = `novels/${novelId}/chapters/${chapterId}/segments/${segmentId}`;
      try {
        await updateDoc(doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', segmentId), {
          translatedText: translatedText.slice(0, FIELD_LIMITS.SEGMENT_TRANSLATED_MAX),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const batchUpdateChapterSegments = useCallback(
    async (
      novelId: string,
      chapterId: string,
      updates: Array<{ segmentId: string; translatedText: string }>,
      meta?: { titleTranslated?: string; status?: ChapterStatus; translatedCount?: number }
    ) => {
      if (!user) return;
      const path = `novels/${novelId}/chapters/${chapterId}/segments`;
      try {
        for (let i = 0; i < updates.length; i += 380) {
          const batch = writeBatch(db);
          updates.slice(i, i + 380).forEach((item) => {
            const ref = doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', item.segmentId);
            batch.update(ref, {
              translatedText: item.translatedText.slice(0, FIELD_LIMITS.SEGMENT_TRANSLATED_MAX),
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }
        if (meta) {
          await updateChapterMeta(novelId, chapterId, meta);
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user, updateChapterMeta]
  );

  const fetchChapterSegments = useCallback(
    async (novelId: string, chapterId: string): Promise<Segment[]> => {
      if (!user) return [];
      const segPath = `novels/${novelId}/chapters/${chapterId}/segments`;
      try {
        const snap = await getDocs(query(collection(db, segPath), where('ownerId', '==', user.uid)));
        const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Segment, 'id'>) }));
        list.sort((a, b) => a.index - b.index);
        return list;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, segPath);
      }
    },
    [user]
  );

  const fetchNovelExportData = useCallback(
    async (novelId: string): Promise<Array<{ chapter: Chapter; segments: Segment[] }>> => {
      if (!user) return [];
      const chapPath = `novels/${novelId}/chapters`;
      try {
        const chapSnap = await getDocs(
          query(collection(db, chapPath), where('ownerId', '==', user.uid))
        );
        const chapterList = chapSnap.docs.map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Chapter, 'id'>),
        }));
        chapterList.sort((a, b) => a.order - b.order);

        const result: Array<{ chapter: Chapter; segments: Segment[] }> = [];
        for (const chap of chapterList) {
          const segs = await fetchChapterSegments(novelId, chap.id);
          result.push({ chapter: chap, segments: segs });
        }
        return result;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, chapPath);
      }
    },
    [user, fetchChapterSegments]
  );

  const updateSegmentReviewed = useCallback(
    async (novelId: string, chapterId: string, segmentId: string, isReviewed: boolean) => {
      if (!user) return;
      const path = `novels/${novelId}/chapters/${chapterId}/segments/${segmentId}`;
      try {
        await updateDoc(doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', segmentId), {
          isReviewed,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const updateSegmentNote = useCallback(
    async (novelId: string, chapterId: string, segmentId: string, note: string) => {
      if (!user) return;
      const path = `novels/${novelId}/chapters/${chapterId}/segments/${segmentId}`;
      try {
        await updateDoc(doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', segmentId), {
          note: note.slice(0, FIELD_LIMITS.SEGMENT_NOTE_MAX),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const updateSegmentSource = useCallback(
    async (novelId: string, chapterId: string, segmentId: string, sourceText: string) => {
      if (!user) return;
      const path = `novels/${novelId}/chapters/${chapterId}/segments/${segmentId}`;
      try {
        await updateDoc(doc(db, 'novels', novelId, 'chapters', chapterId, 'segments', segmentId), {
          sourceText: sourceText.slice(0, FIELD_LIMITS.SEGMENT_SOURCE_MAX),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  // Glossary CRUD
  const addGlossaryTerm = useCallback(
    async (
      novelId: string,
      input: { sourceTerm: string; targetTerm: string; category: GlossaryCategory }
    ) => {
      if (!user) return;
      const termId = makeId('term');
      const path = `novels/${novelId}/glossaries/${termId}`;
      try {
        await setDoc(doc(db, 'novels', novelId, 'glossaries', termId), {
          ownerId: user.uid,
          novelId,
          sourceTerm: input.sourceTerm.trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX),
          targetTerm: input.targetTerm.trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX),
          category: input.category,
          enabled: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.CREATE, path);
      }
    },
    [user]
  );

  const bulkAddGlossaryTerms = useCallback(
    async (
      novelId: string,
      entries: Array<{ sourceTerm: string; targetTerm: string; category: GlossaryCategory }>
    ) => {
      if (!user || entries.length === 0) return;
      const path = `novels/${novelId}/glossaries`;
      try {
        for (let i = 0; i < entries.length; i += 400) {
          const batch = writeBatch(db);
          entries.slice(i, i + 400).forEach((entry) => {
            const termId = makeId('term');
            const ref = doc(db, 'novels', novelId, 'glossaries', termId);
            batch.set(ref, {
              ownerId: user.uid,
              novelId,
              sourceTerm: entry.sourceTerm.trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX),
              targetTerm: entry.targetTerm.trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX),
              category: entry.category,
              enabled: true,
              createdAt: serverTimestamp(),
              updatedAt: serverTimestamp(),
            });
          });
          await batch.commit();
        }
      } catch (error) {
        handleFirestoreError(error, OperationType.WRITE, path);
      }
    },
    [user]
  );

  const copyGlossaryFromNovel = useCallback(
    async (sourceNovelId: string, targetNovelId: string): Promise<number> => {
      if (!user || !sourceNovelId || !targetNovelId || sourceNovelId === targetNovelId) return 0;
      const srcPath = `novels/${sourceNovelId}/glossaries`;
      try {
        const [srcSnap, tgtSnap] = await Promise.all([
          getDocs(query(collection(db, srcPath), where('ownerId', '==', user.uid))),
          getDocs(
            query(
              collection(db, `novels/${targetNovelId}/glossaries`),
              where('ownerId', '==', user.uid)
            )
          ),
        ]);

        const existingSources = new Set(
          tgtSnap.docs.map((d) => String(d.data().sourceTerm || '').trim())
        );

        const toAdd = srcSnap.docs
          .map((d) => d.data() as Omit<GlossaryTerm, 'id'>)
          .filter((item) => item.sourceTerm?.trim() && !existingSources.has(item.sourceTerm.trim()))
          .map((item) => ({
            sourceTerm: item.sourceTerm,
            targetTerm: item.targetTerm,
            category: item.category || 'other',
          }));

        if (toAdd.length > 0) {
          await bulkAddGlossaryTerms(targetNovelId, toAdd);
        }
        return toAdd.length;
      } catch (error) {
        handleFirestoreError(error, OperationType.LIST, srcPath);
      }
    },
    [user, bulkAddGlossaryTerms]
  );

  const updateGlossaryTerm = useCallback(
    async (
      novelId: string,
      termId: string,
      input: { sourceTerm: string; targetTerm: string; category: GlossaryCategory; enabled: boolean }
    ) => {
      if (!user) return;
      const path = `novels/${novelId}/glossaries/${termId}`;
      try {
        await updateDoc(doc(db, 'novels', novelId, 'glossaries', termId), {
          sourceTerm: input.sourceTerm.trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX),
          targetTerm: input.targetTerm.trim().slice(0, FIELD_LIMITS.GLOSSARY_TERM_MAX),
          category: input.category,
          enabled: input.enabled,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const toggleGlossaryTerm = useCallback(
    async (novelId: string, termId: string, enabled: boolean) => {
      if (!user) return;
      const path = `novels/${novelId}/glossaries/${termId}`;
      try {
        await updateDoc(doc(db, 'novels', novelId, 'glossaries', termId), {
          enabled,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(error, OperationType.UPDATE, path);
      }
    },
    [user]
  );

  const deleteGlossaryTerm = useCallback(
    async (novelId: string, termId: string) => {
      if (!user) return;
      const path = `novels/${novelId}/glossaries/${termId}`;
      try {
        await deleteDoc(doc(db, 'novels', novelId, 'glossaries', termId));
      } catch (error) {
        handleFirestoreError(error, OperationType.DELETE, path);
      }
    },
    [user]
  );

  // Create a rich sample project in Firestore on user click
  const createSampleNovel = useCallback(async () => {
    if (!user) return;
    const novelId = await createNovel({
      title: 'Thanh Vân Kiếm Lục (Mẫu thử)',
      author: 'Vong Ngữ (Bản mẫu)',
      sourceLang: 'zh',
      targetLang: 'vi',
      styleInstruction:
        'Dịch theo văn phong tiên hiệp cổ trang trang trọng, mượt mà; giữ nguyên xưng hô sư huynh, sư muội, đạo hữu và các danh xưng Hán Việt.',
    });

    await bulkAddGlossaryTerms(novelId, [
      { sourceTerm: '林尘', targetTerm: 'Lâm Trần', category: 'character' },
      { sourceTerm: '青云宗', targetTerm: 'Thanh Vân Tông', category: 'location' },
      { sourceTerm: '灵气', targetTerm: 'linh khí', category: 'other' },
      { sourceTerm: '青霜剑', targetTerm: 'Thanh Sương Kiếm', category: 'skill' },
      { sourceTerm: '筑基期', targetTerm: 'Trúc Cơ kỳ', category: 'skill' },
    ]);

    await createChapterWithSegments(novelId, {
      titleSource: '第一章 山门初雪',
      titleTranslated: 'Chương 1: Tuyết đầu mùa nơi sơn môn',
      order: 1,
      paragraphs: [
        '暮色四合，青云宗山门外的石阶已落了一层薄雪。',
        '林尘紧了紧身上的青色道袍，手掌按在腰间的青霜剑柄上，目光静静望向云雾深处的主峰。',
        '自从三年前踏入外门以来，他日夜吐纳灵气，终于在昨夜隐约触及了筑基期的门槛。',
        '“林师弟，长老在传功殿等你。”石阶上方传来一声清朗的呼唤，一位身着白袍的青年踏雪而来。',
        '林尘收回思绪，拱手行礼道：“有劳师兄通报，我这便随你前往。”',
      ],
    });
  }, [user, createNovel, bulkAddGlossaryTerms, createChapterWithSegments]);

  return {
    user,
    authReady,
    authError,
    handleSignIn,
    handleSignOut,
    settings,
    saveUserSettings,
    novels,
    novelsLoading,
    activeNovelId,
    setActiveNovelId,
    chapters,
    chaptersLoading,
    activeChapterId,
    setActiveChapterId,
    segments,
    segmentsLoading,
    glossary,
    glossaryLoading,
    createNovel,
    updateNovel,
    deleteNovel,
    createChapterWithSegments,
    createMultipleChapters,
    updateChapterMeta,
    deleteChapter,
    updateSegmentTranslation,
    batchUpdateChapterSegments,
    fetchChapterSegments,
    fetchNovelExportData,
    updateSegmentReviewed,
    updateSegmentNote,
    updateSegmentSource,
    addGlossaryTerm,
    bulkAddGlossaryTerms,
    copyGlossaryFromNovel,
    updateGlossaryTerm,
    toggleGlossaryTerm,
    deleteGlossaryTerm,
    createSampleNovel,
  };
}

