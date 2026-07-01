import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  ArrowLeft,
  Eye,
  GripVertical,
  Pencil,
  Plus,
  Trash2,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { cn } from "@/lib/utils";
import {
  QuestionFormDialog,
  type QuestionFormValues,
} from "@/components/PersonalTests/QuestionFormDialog";
import { personalTestUpdateSchema } from "../../shared/validation/personalTest";

type QuestionRow = {
  question: {
    _id: Id<"personalTestQuestions">;
    title: string;
    title_ar: string;
    answerType: "single" | "multi";
    displayOrder: number;
  };
  answers: Array<{
    _id: Id<"personalTestAnswers">;
    text: string;
    text_ar: string;
    recommendedCourseIds: Id<"courses">[];
  }>;
};

type SortableQuestionRowProps = {
  item: QuestionRow;
  index: number;
  onEdit: (item: QuestionRow) => void;
  onDelete: (item: QuestionRow) => void;
};

const SortableQuestionRow = ({
  item,
  index,
  onEdit,
  onDelete,
}: SortableQuestionRowProps) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: item.question._id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "opacity-50 bg-muted/50")}
    >
      <TableCell className="w-10">
        <button
          type="button"
          className="cursor-grab active:cursor-grabbing touch-none p-1"
          {...attributes}
          {...listeners}
        >
          <GripVertical className="h-4 w-4 text-muted-foreground" />
        </button>
      </TableCell>
      <TableCell className="w-12 text-center font-semibold text-muted-foreground">
        {index + 1}
      </TableCell>
      <TableCell>
        <div>
          <span className="font-medium">{item.question.title}</span>
          <span className="block text-xs text-muted-foreground">{item.question.title_ar}</span>
        </div>
      </TableCell>
      <TableCell>
        <Badge variant="outline">
          {item.question.answerType === "single" ? "Single choice" : "Multi choice"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => onEdit(item)}>
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive"
            onClick={() => onDelete(item)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
};

const PersonalTestDetail = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const testId = id as Id<"personalTests">;

  const data = useQuery(api.personalTest.getPersonalTest, { testId });
  const courses = useQuery(api.plans.listCoursesForPicker);

  const updateTest = useMutation(api.personalTest.updatePersonalTest);
  const setEnabled = useMutation(api.personalTest.setPersonalTestEnabled);
  const publishTest = useMutation(api.personalTest.publishPersonalTest);
  const saveQuestion = useMutation(api.personalTest.savePersonalTestQuestion);
  const deleteQuestion = useMutation(api.personalTest.deletePersonalTestQuestion);
  const reorderQuestions = useMutation(api.personalTest.reorderPersonalTestQuestions);

  const [activeTab, setActiveTab] = useState("info");
  const [name, setName] = useState("");
  const [nameAr, setNameAr] = useState("");
  const [description, setDescription] = useState("");
  const [descriptionAr, setDescriptionAr] = useState("");
  const [showAllResults, setShowAllResults] = useState(true);
  const [maxCourses, setMaxCourses] = useState("");
  const [isSavingInfo, setIsSavingInfo] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isTogglingEnabled, setIsTogglingEnabled] = useState(false);

  const [questionDialogOpen, setQuestionDialogOpen] = useState(false);
  const [editingQuestion, setEditingQuestion] = useState<QuestionRow | null>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  const [questionToDelete, setQuestionToDelete] = useState<QuestionRow | null>(null);
  const [isDeletingQuestion, setIsDeletingQuestion] = useState(false);

  const [orderedQuestions, setOrderedQuestions] = useState<QuestionRow[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  useEffect(() => {
    if (!data) return;
    setName(data.test.name);
    setNameAr(data.test.name_ar);
    setDescription(data.test.description ?? "");
    setDescriptionAr(data.test.description_ar ?? "");
    setShowAllResults(data.test.resultSettings.showAll);
    setMaxCourses(
      data.test.resultSettings.maxCourses !== undefined
        ? String(data.test.resultSettings.maxCourses)
        : "",
    );
    setOrderedQuestions(data.questions);
  }, [data]);

  const courseMap = useMemo(() => {
    const map = new Map<Id<"courses">, { name: string; name_ar: string }>();
    for (const course of courses ?? []) {
      map.set(course._id, { name: course.name, name_ar: course.name_ar });
    }
    return map;
  }, [courses]);

  const recommendedCourses = useMemo(() => {
    if (!data) return [];
    return data.recommendedCourseIds
      .map((courseId) => {
        const course = courseMap.get(courseId);
        return course ? { _id: courseId, ...course } : null;
      })
      .filter(Boolean) as Array<{ _id: Id<"courses">; name: string; name_ar: string }>;
  }, [data, courseMap]);

  const questionFormInitial = useMemo<QuestionFormValues | undefined>(() => {
    if (!editingQuestion) return undefined;
    return {
      title: editingQuestion.question.title,
      titleAr: editingQuestion.question.title_ar,
      answerType: editingQuestion.question.answerType,
      answers: editingQuestion.answers.map((a) => ({
        text: a.text,
        textAr: a.text_ar,
        recommendedCourseIds: a.recommendedCourseIds,
      })),
    };
  }, [editingQuestion]);

  const handleSaveInfo = async (event?: FormEvent) => {
    event?.preventDefault();
    const parsedMax = maxCourses.trim() ? Number.parseInt(maxCourses, 10) : undefined;
    const result = personalTestUpdateSchema.safeParse({
      name,
      nameAr,
      description: description || undefined,
      descriptionAr: descriptionAr || undefined,
      resultSettings: {
        showAll: showAllResults,
        maxCourses: showAllResults ? undefined : parsedMax,
      },
    });

    if (!result.success) {
      toast.error(result.error.errors[0]?.message ?? "Invalid input.");
      return;
    }

    setIsSavingInfo(true);
    try {
      await updateTest({
        testId,
        name: result.data.name,
        nameAr: result.data.nameAr,
        description: result.data.description,
        descriptionAr: result.data.descriptionAr,
        resultSettings: result.data.resultSettings,
      });
      toast.success("Test info saved.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save.");
    } finally {
      setIsSavingInfo(false);
    }
  };

  const handleToggleEnabled = async (enabled: boolean) => {
    setIsTogglingEnabled(true);
    try {
      await setEnabled({ testId, enabled });
      toast.success(enabled ? "Test enabled." : "Test disabled.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to update status.");
    } finally {
      setIsTogglingEnabled(false);
    }
  };

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      await publishTest({ testId });
      toast.success("Test published.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to publish.");
    } finally {
      setIsPublishing(false);
    }
  };

  const handleSaveQuestion = async (values: QuestionFormValues) => {
    setIsSavingQuestion(true);
    try {
      await saveQuestion({
        testId,
        questionId: editingQuestion?.question._id,
        title: values.title,
        titleAr: values.titleAr,
        answerType: values.answerType,
        answers: values.answers.map((a) => ({
          text: a.text,
          textAr: a.textAr,
          recommendedCourseIds: a.recommendedCourseIds,
        })),
      });
      toast.success(editingQuestion ? "Question updated." : "Question added.");
      setQuestionDialogOpen(false);
      setEditingQuestion(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save question.");
    } finally {
      setIsSavingQuestion(false);
    }
  };

  const handleDeleteQuestion = async () => {
    if (!questionToDelete) return;
    setIsDeletingQuestion(true);
    try {
      await deleteQuestion({
        testId,
        questionId: questionToDelete.question._id,
      });
      toast.success("Question deleted.");
      setQuestionToDelete(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to delete question.");
    } finally {
      setIsDeletingQuestion(false);
    }
  };

  const handleDragEnd = useCallback(
    async (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      const oldIndex = orderedQuestions.findIndex((q) => q.question._id === active.id);
      const newIndex = orderedQuestions.findIndex((q) => q.question._id === over.id);
      if (oldIndex < 0 || newIndex < 0) return;

      const reordered = [...orderedQuestions];
      const [moved] = reordered.splice(oldIndex, 1);
      reordered.splice(newIndex, 0, moved!);
      setOrderedQuestions(reordered);

      try {
        await reorderQuestions({
          testId,
          questionIds: reordered.map((q) => q.question._id),
        });
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Failed to reorder.");
        setOrderedQuestions(data?.questions ?? []);
      }
    },
    [orderedQuestions, reorderQuestions, testId, data?.questions],
  );

  if (data === undefined) {
    return <p className="text-muted-foreground">Loading test…</p>;
  }

  if (data === null) {
    return (
      <div className="space-y-4">
        <p>Test not found.</p>
        <Button variant="outline" onClick={() => navigate("/personal-tests")}>
          Back to tests
        </Button>
      </div>
    );
  }

  const { test, canPublish } = data;
  const effectiveStatus =
    test.status === "draft" && test.publishedSnapshot !== undefined
      ? "published"
      : test.status;
  const isDraft = effectiveStatus === "draft";
  const isPublished = effectiveStatus === "published";
  const hasBeenPublished = test.publishedSnapshot !== undefined;
  const canToggleAvailability = hasBeenPublished && !isDraft;
  const showPublishButton =
    canPublish && (isDraft || test.hasUnpublishedChanges);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="space-y-2">
          <Button variant="ghost" size="sm" className="-ml-2" asChild>
            <Link to="/personal-tests">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Personal Tests
            </Link>
          </Button>
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight">{test.name}</h1>
            <Badge variant={isDraft ? "secondary" : isPublished ? "default" : "outline"}>
              {isDraft ? "Draft" : isPublished ? "Published" : "Disabled"}
            </Badge>
            {test.hasUnpublishedChanges && (
              <Badge variant="outline" className="text-amber-600 border-amber-300">
                Unpublished changes
              </Badge>
            )}
          </div>
          <p className="text-sm text-muted-foreground">{test.name_ar}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" asChild>
            <Link to={`/personal-tests/${testId}/preview`}>
              <Eye className="mr-2 h-4 w-4" />
              Preview
            </Link>
          </Button>
          {showPublishButton && (
            <Button variant="cta" onClick={handlePublish} disabled={isPublishing}>
              <Upload className="mr-2 h-4 w-4" />
              {isPublishing
                ? "Publishing…"
                : test.hasUnpublishedChanges
                  ? "Publish changes"
                  : "Publish"}
            </Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="info">Test info</TabsTrigger>
          <TabsTrigger value="questions">
            Questions
            <Badge variant="secondary" className="ml-2">
              {test.questionCount}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="info" className="mt-6">
          <form onSubmit={handleSaveInfo} className="space-y-6">
          <div className="rounded-xl border bg-card p-6 space-y-4 max-w-2xl">
            <h2 className="font-medium">Basic information</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Name</Label>
                <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name-ar">Name (Arabic)</Label>
                <Input
                  id="name-ar"
                  value={nameAr}
                  dir="rtl"
                  onChange={(e) => setNameAr(e.target.value)}
                />
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="description">Description (optional)</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description-ar">Description (Arabic, optional)</Label>
                <Textarea
                  id="description-ar"
                  value={descriptionAr}
                  dir="rtl"
                  onChange={(e) => setDescriptionAr(e.target.value)}
                  rows={3}
                />
              </div>
            </div>

            {canToggleAvailability && (
              <div className="flex items-center justify-between rounded-lg border p-4">
                <div>
                  <Label htmlFor="enabled">Status</Label>
                  <p className="text-sm text-muted-foreground">
                    {isPublished ? "Test is enabled and live." : "Test is disabled."}
                  </p>
                </div>
                <Switch
                  id="enabled"
                  checked={isPublished}
                  disabled={isTogglingEnabled}
                  onCheckedChange={handleToggleEnabled}
                />
              </div>
            )}

            {!canToggleAvailability && (
              <p className="text-sm text-muted-foreground">
                Publish the test to enable or disable it for users.
              </p>
            )}

            <Button type="submit" variant="cta" disabled={isSavingInfo}>
              {isSavingInfo ? "Saving…" : "Save changes"}
            </Button>
          </div>

          <div className="rounded-xl border bg-card p-6 space-y-4 max-w-2xl">
            <h2 className="font-medium">Result settings</h2>
            <div className="flex items-center justify-between rounded-lg border p-4">
              <div>
                <Label htmlFor="show-all">Show all recommended courses</Label>
                <p className="text-sm text-muted-foreground">
                  When off, limit how many courses appear in results.
                </p>
              </div>
              <Switch
                id="show-all"
                checked={showAllResults}
                onCheckedChange={setShowAllResults}
              />
            </div>
            {!showAllResults && (
              <div className="space-y-2 max-w-xs">
                <Label htmlFor="max-courses">Limit results to</Label>
                <Input
                  id="max-courses"
                  type="number"
                  min={1}
                  max={100}
                  value={maxCourses}
                  onChange={(e) => setMaxCourses(e.target.value)}
                  placeholder="e.g. 5"
                />
              </div>
            )}
          </div>
          </form>
        </TabsContent>

        <TabsContent value="questions" className="mt-6">
          <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
            <aside className="rounded-xl border bg-card p-4 space-y-3 h-fit">
              <h3 className="text-sm font-medium">Recommended courses</h3>
              <p className="text-xs text-muted-foreground">
                Courses linked through answer recommendations in this test.
              </p>
              {recommendedCourses.length === 0 ? (
                <p className="text-sm text-muted-foreground">No courses yet.</p>
              ) : (
                <ul className="space-y-2">
                  {recommendedCourses.map((course) => (
                    <li
                      key={course._id}
                      className="rounded-md border px-3 py-2 text-sm"
                    >
                      <span className="font-medium">{course.name}</span>
                      <span className="block text-xs text-muted-foreground">
                        {course.name_ar}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </aside>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-medium">Questions</h2>
                <Button
                  variant="cta"
                  onClick={() => {
                    setEditingQuestion(null);
                    setQuestionDialogOpen(true);
                  }}
                >
                  <Plus className="mr-2 h-4 w-4" />
                  Add question
                </Button>
              </div>

              <div className="rounded-xl border bg-card overflow-hidden">
                <DndContext
                  sensors={sensors}
                  collisionDetection={closestCenter}
                  onDragEnd={handleDragEnd}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead className="w-12 text-center">#</TableHead>
                        <TableHead>Question title</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="w-24">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {orderedQuestions.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                            No questions yet. Add your first question.
                          </TableCell>
                        </TableRow>
                      ) : (
                        <SortableContext
                          items={orderedQuestions.map((q) => q.question._id)}
                          strategy={verticalListSortingStrategy}
                        >
                          {orderedQuestions.map((item, index) => (
                            <SortableQuestionRow
                              key={item.question._id}
                              item={item}
                              index={index}
                              onEdit={(row) => {
                                setEditingQuestion(row);
                                setQuestionDialogOpen(true);
                              }}
                              onDelete={setQuestionToDelete}
                            />
                          ))}
                        </SortableContext>
                      )}
                    </TableBody>
                  </Table>
                </DndContext>
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      <QuestionFormDialog
        open={questionDialogOpen}
        onOpenChange={(open) => {
          setQuestionDialogOpen(open);
          if (!open) setEditingQuestion(null);
        }}
        mode={editingQuestion ? "edit" : "create"}
        initial={questionFormInitial}
        onSave={handleSaveQuestion}
        isSaving={isSavingQuestion}
      />

      <AlertDialog open={!!questionToDelete} onOpenChange={() => setQuestionToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete question?</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove &ldquo;{questionToDelete?.question.title}&rdquo; and its answers.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeletingQuestion}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteQuestion}
              disabled={isDeletingQuestion}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeletingQuestion ? "Deleting…" : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default PersonalTestDetail;
