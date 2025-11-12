import { useState } from "react";
import { Plus, Pencil, Trash2, Video, FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

interface Lesson {
  id: string;
  title: string;
  description: string;
  course: string;
  duration: string;
  type: "video" | "article";
  order: number;
}

const Lessons = () => {
  const [lessons, setLessons] = useState<Lesson[]>([
    { id: "1", title: "Introduction to React", description: "Learn the basics", course: "React Masterclass", duration: "15 min", type: "video", order: 1 },
    { id: "2", title: "Components & Props", description: "Understanding components", course: "React Masterclass", duration: "20 min", type: "video", order: 2 },
    { id: "3", title: "Design Principles Overview", description: "Core principles", course: "UI Design Principles", duration: "10 min", type: "article", order: 1 },
  ]);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingLesson, setEditingLesson] = useState<Lesson | null>(null);

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;
    const course = formData.get("course") as string;
    const duration = formData.get("duration") as string;
    const type = formData.get("type") as "video" | "article";
    const order = parseInt(formData.get("order") as string);

    if (editingLesson) {
      setLessons(lessons.map(lesson => 
        lesson.id === editingLesson.id 
          ? { ...lesson, title, description, course, duration, type, order }
          : lesson
      ));
      toast.success("Lesson updated successfully");
    } else {
      setLessons([...lessons, {
        id: Date.now().toString(),
        title,
        description,
        course,
        duration,
        type,
        order
      }]);
      toast.success("Lesson created successfully");
    }

    setIsDialogOpen(false);
    setEditingLesson(null);
  };

  const handleDelete = (id: string) => {
    setLessons(lessons.filter(lesson => lesson.id !== id));
    toast.success("Lesson deleted successfully");
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Lessons</h1>
          <p className="text-muted-foreground mt-2">
            Manage individual lessons for your courses
          </p>
        </div>
        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => setEditingLesson(null)} variant="cta">
              <Plus className="h-4 w-4 mr-2" />
              Add Lesson
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editingLesson ? "Edit" : "Create"} Lesson</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="title">Title</Label>
                  <Input
                    id="title"
                    name="title"
                    defaultValue={editingLesson?.title}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Input
                    id="duration"
                    name="duration"
                    placeholder="e.g., 15 min"
                    defaultValue={editingLesson?.duration}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  name="description"
                  defaultValue={editingLesson?.description}
                  required
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="course">Course</Label>
                  <Select name="course" defaultValue={editingLesson?.course}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select course" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="React Masterclass">React Masterclass</SelectItem>
                      <SelectItem value="UI Design Principles">UI Design Principles</SelectItem>
                      <SelectItem value="Python for Beginners">Python for Beginners</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="type">Type</Label>
                  <Select name="type" defaultValue={editingLesson?.type || "video"}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="video">Video</SelectItem>
                      <SelectItem value="article">Article</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="order">Order</Label>
                  <Input
                    id="order"
                    name="order"
                    type="number"
                    defaultValue={editingLesson?.order || 1}
                    required
                  />
                </div>
              </div>
              <Button type="submit" variant="cta" className="w-full">
                {editingLesson ? "Update" : "Create"} Lesson
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Order</TableHead>
              <TableHead>Title</TableHead>
              <TableHead>Course</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Type</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {lessons.map((lesson) => (
              <TableRow key={lesson.id}>
                <TableCell className="font-medium">#{lesson.order}</TableCell>
                <TableCell>{lesson.title}</TableCell>
                <TableCell className="text-muted-foreground">{lesson.course}</TableCell>
                <TableCell>{lesson.duration}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className="gap-1">
                    {lesson.type === "video" ? <Video className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
                    {lesson.type}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => {
                        setEditingLesson(lesson);
                        setIsDialogOpen(true);
                      }}
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(lesson.id)}
                    >
                      <Trash2 className="h-4 w-4 text-destructive" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};

export default Lessons;
