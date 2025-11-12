import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Upload, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { Card, CardContent } from "@/components/ui/card";
import { toast } from "sonner";

const CourseDetail = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [coverImage, setCoverImage] = useState<string | null>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setCoverImage(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    toast.success("Course updated successfully");
    navigate("/courses");
  };

  const handleCancel = () => {
    navigate("/courses");
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate("/courses")}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Edit Course</h1>
          <p className="text-muted-foreground mt-1">Update course Detail</p>
        </div>
      </div>

      <form onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Main Form */}
          <div className="lg:col-span-2 space-y-6">
            <Card className="backdrop-blur-xl border-border/50">
              <CardContent className="p-6 space-y-6">
                {/* Course Title */}
                <div className="space-y-2">
                  <Label htmlFor="title">Course Title (EN / AR)</Label>
                  <Input
                    id="title"
                    name="title"
                    placeholder="Enter course title in English and Arabic"
                    required
                  />
                </div>

                {/* Course Category */}
                <div className="space-y-2">
                  <Label htmlFor="category">Course Category</Label>
                  <Select name="category" required>
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="web-development">Web Development</SelectItem>
                      <SelectItem value="design">Design</SelectItem>
                      <SelectItem value="data-science">Data Science</SelectItem>
                      <SelectItem value="business">Business</SelectItem>
                      <SelectItem value="marketing">Marketing</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {/* Short Description */}
                <div className="space-y-2">
                  <Label htmlFor="short-description">Short Course Description (EN / AR)</Label>
                  <Textarea
                    id="short-description"
                    name="short-description"
                    placeholder="Brief description in English and Arabic"
                    rows={3}
                    required
                  />
                </div>

                {/* Full Description */}
                <div className="space-y-2">
                  <Label htmlFor="description">Course Description (EN / AR)</Label>
                  <Textarea
                    id="description"
                    name="description"
                    placeholder="Detailed description in English and Arabic"
                    rows={6}
                    required
                  />
                </div>

                {/* Trial Video */}
                <div className="space-y-2">
                  <Label htmlFor="trial-video">Trial Video</Label>
                  <Input
                    id="trial-video"
                    name="trial-video"
                    placeholder="Enter video URL or upload"
                    type="url"
                  />
                </div>

                {/* Duration */}
                <div className="space-y-2">
                  <Label htmlFor="duration">Duration</Label>
                  <Input
                    id="duration"
                    name="duration"
                    placeholder="e.g., 12 hours"
                    required
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Episodes & Cover Image */}
          <div className="space-y-6">
            {/* Manage Episodes */}
            <Card className="backdrop-blur-xl border-border/50">
              <CardContent className="p-6">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => toast.info("Navigate to episodes management")}
                >
                  Manage Episodes
                </Button>
              </CardContent>
            </Card>

            {/* Cover Image */}
            <Card className="backdrop-blur-xl border-border/50">
              <CardContent className="p-6 space-y-4">
                <Label>Cover Image</Label>
                <div
                  className="relative border-2 border-dashed border-border rounded-lg aspect-video flex items-center justify-center cursor-pointer hover:border-primary/50 transition-colors bg-muted/30"
                  onClick={() => document.getElementById("cover-upload")?.click()}
                >
                  {coverImage ? (
                    <img
                      src={coverImage}
                      alt="Cover preview"
                      className="w-full h-full object-cover rounded-lg"
                    />
                  ) : (
                    <div className="text-center">
                      <ImageIcon className="h-12 w-12 mx-auto text-muted-foreground mb-2" />
                      <p className="text-sm text-muted-foreground">
                        Click to upload cover image
                      </p>
                    </div>
                  )}
                  <input
                    id="cover-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Status */}
            <Card className="backdrop-blur-xl border-border/50">
              <CardContent className="p-6 space-y-4">
                <Label htmlFor="status">Status</Label>
                <Select name="status" defaultValue="draft">
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="draft">Draft</SelectItem>
                    <SelectItem value="published">Published</SelectItem>
                  </SelectContent>
                </Select>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex justify-end gap-4 mt-6">
          <Button
            type="button"
            variant="outline"
            onClick={handleCancel}
            className="min-w-32"
          >
            Cancel
          </Button>
          <Button type="submit" variant="cta" className="min-w-32">
            Update Course
          </Button>
        </div>
      </form>
    </div>
  );
};

export default CourseDetail;
