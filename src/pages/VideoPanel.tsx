import { FormEvent, useMemo, useState } from "react";
import { useMutation, useQuery } from "convex/react";

import { api } from "../../convex/_generated/api";
import type { Doc } from "../../convex/_generated/dataModel";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";

type VideoDoc = Doc<"videos">;

const isVimeoPlayerUrl = (value: string): boolean =>
  /^https:\/\/player\.vimeo\.com\/video\/\d+/.test(value);

const VideoPanel = () => {
  const { toast } = useToast();
  const [url, setUrl] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const videos = useQuery(api.video.listVideos);
  const addVideo = useMutation(api.video.addVideo);

  const videoList = useMemo<VideoDoc[]>(() => videos ?? [], [videos]);
  const latestVideo = videoList[0];
  const isLoading = videos === undefined;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmed = url.trim();

    if (!trimmed) {
      setFormError("Please paste a Vimeo embed URL before saving.");
      return;
    }

    if (!isVimeoPlayerUrl(trimmed)) {
      setFormError("Use the full Vimeo embed URL, e.g. https://player.vimeo.com/video/123456789.");
      return;
    }

    setFormError(null);
    setIsSaving(true);

    try {
      await addVideo({ url: trimmed });
      setUrl("");
      toast({
        title: "Video link saved",
        description: "The Vimeo embed is now stored and ready to preview.",
      });
    } catch (cause) {
      console.error(cause);
      setFormError("Something went wrong while saving the video. Please try again.");
      toast({
        variant: "destructive",
        title: "Unable to save link",
        description: "We couldn't reach the server. Please retry in a moment.",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="relative z-10 space-y-10">
      <div className="space-y-3">
        <h1 className="text-4xl font-bold tracking-tight text-foreground md:text-5xl">Video Panel</h1>
        <p className="text-muted-foreground text-lg">
          Save Vimeo embed links to preview them instantly and share with your learners.
        </p>
      </div>

      <Card className="card-elevated">
        <CardHeader>
          <CardTitle>Save a new video</CardTitle>
          <CardDescription>
            Paste the <span className="font-medium text-foreground">player.vimeo.com</span> URL from the embed code.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form className="space-y-6" onSubmit={handleSubmit}>
            <div className="space-y-3">
              <Label htmlFor="videoUrl">Vimeo embed URL</Label>
              <div className="flex flex-col gap-3 md:flex-row">
                <Input
                  id="videoUrl"
                  name="videoUrl"
                  type="url"
                  inputMode="url"
                  placeholder="https://player.vimeo.com/video/1130646892"
                  value={url}
                  onChange={(event) => setUrl(event.target.value)}
                  className="md:flex-1"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  className="md:w-auto"
                  disabled={isSaving}
                >
                  {isSaving ? "Saving…" : "Save link"}
                </Button>
              </div>
              <p className="text-sm text-muted-foreground">
                The link should come directly from the iframe embed code provided by Vimeo.
              </p>
              {formError && <p className="text-sm font-medium text-destructive">{formError}</p>}
            </div>
          </form>
        </CardContent>
      </Card>

      <div className="grid gap-8 lg:grid-cols-[2fr,1fr]">
        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Latest video</CardTitle>
            <CardDescription>Use the embed player to preview what learners will see.</CardDescription>
          </CardHeader>
          <CardContent>
            {latestVideo ? (
              <AspectRatio ratio={16 / 9} className="overflow-hidden rounded-2xl border border-border/40 bg-secondary/40 shadow-inner">
                <iframe
                  src={latestVideo.url}
                  title="Latest saved Vimeo video"
                  allow="autoplay; fullscreen; picture-in-picture; clipboard-write; encrypted-media; web-share"
                  referrerPolicy="strict-origin-when-cross-origin"
                  className="h-full w-full border-0"
                  allowFullScreen
                />
              </AspectRatio>
            ) : isLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-6 w-32" />
                <Skeleton className="h-64 w-full rounded-2xl" />
              </div>
            ) : (
              <div className="rounded-2xl border border-dashed border-border/60 p-8 text-center">
                <p className="text-sm text-muted-foreground">No videos saved yet. Add a link to get started.</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="card-elevated">
          <CardHeader>
            <CardTitle>Saved links</CardTitle>
            <CardDescription>Recent Vimeo embeds stored in Convex.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {videoList.length === 0 ? (
              isLoading ? (
                <div className="space-y-3">
                  <Skeleton className="h-4 w-3/4" />
                  <Skeleton className="h-4 w-5/6" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">Nothing stored yet.</p>
              )
            ) : (
              <ScrollArea className="h-64 rounded-xl border border-border/40 bg-card/60 p-4">
                <div className="space-y-4">
                  {videoList.map((video, index) => (
                    <div key={video._id} className="space-y-3">
                      <div className="text-xs uppercase tracking-wide text-muted-foreground">
                        Saved #{videoList.length - index}
                      </div>
                      <a
                        href={video.url}
                        target="_blank"
                        rel="noreferrer"
                        className="break-words text-sm font-medium text-primary hover:underline"
                      >
                        {video.url}
                      </a>
                      {index < videoList.length - 1 && <Separator className="bg-border/50" />}
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VideoPanel;

