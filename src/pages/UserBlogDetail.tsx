import { Link, useParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { format } from "date-fns";
import { arSA, enUS } from "date-fns/locale";
import { ChevronRight, Clock } from "lucide-react";
import { useMemo, type ReactNode } from "react";

import { api } from "../../convex/_generated/api";
import { MarkdownContent } from "@/components/MarkdownContent";
import { useLanguage } from "@/hooks/use-language";
import { getLocalizedSiteUrl } from "@/lib/siteUrl";
import { cn } from "@/lib/utils";

const ShareIconButton = ({
  href,
  label,
  className,
  children,
}: {
  href: string;
  label: string;
  className: string;
  children: ReactNode;
}) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    aria-label={label}
    className={cn(
      "flex h-8 w-8 items-center justify-center rounded-full text-white transition-opacity hover:opacity-90",
      className,
    )}
  >
    {children}
  </a>
);

const UserBlogDetail = () => {
  const { slug } = useParams<{ slug: string }>();
  const { language, t, isRTL } = useLanguage();
  const dateLocale = language === "ar" ? arSA : enUS;
  const relatedSeed = useMemo(
    () => Math.floor(Math.random() * 1_000_000_000),
    [slug],
  );

  const blog = useQuery(
    api.blog.getPublishedBlog,
    slug ? { slug, relatedSeed } : "skip",
  );

  if (blog === undefined) {
    return (
      <div className="mx-auto max-w-6xl py-16 text-center text-muted-foreground" dir={isRTL ? "rtl" : "ltr"}>
        {t("loading")}
      </div>
    );
  }

  if (blog === null) {
    return (
      <div className="mx-auto max-w-6xl space-y-4 py-16 text-center" dir={isRTL ? "rtl" : "ltr"}>
        <p className="text-muted-foreground">{t("blogNotFound")}</p>
        <Link to="/articles" className="text-sm font-medium text-pink-600 hover:text-pink-700">
          {t("backToBlogs")}
        </Link>
      </div>
    );
  }

  const title = language === "ar" ? blog.title_ar : blog.title;
  const body = language === "ar" ? blog.body_ar : blog.body;
  const categoryName = language === "ar" ? blog.category.name_ar : blog.category.name;
  const authorName = language === "ar" ? blog.author.name_ar : blog.author.name;
  const authorBio =
    language === "ar" ? blog.author.description_ar : blog.author.description;
  const authorImage =
    blog.author.profile_thumbnail_url ?? blog.author.profile_image_url;
  const heroImage = blog.image_url ?? blog.thumbnail_image_url;
  const publishedLabel = blog.publishedAt
    ? format(new Date(blog.publishedAt), "d MMM yyyy", { locale: dateLocale })
    : null;

  const shareUrl = getLocalizedSiteUrl(
    language === "ar" ? "ar" : "en",
    `blog/${blog.slug}`,
  );
  const encodedUrl = encodeURIComponent(shareUrl);
  const encodedTitle = encodeURIComponent(title);

  return (
    <div className="mx-auto max-w-6xl space-y-8 pb-10" dir={isRTL ? "rtl" : "ltr"}>
      <nav className="flex flex-wrap items-center gap-1.5 text-sm text-muted-foreground">
        <Link to="/user-dashboard" className="hover:text-foreground">
          {t("home")}
        </Link>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 opacity-60", isRTL && "rotate-180")} />
        <Link to="/articles" className="hover:text-foreground">
          {t("blogs")}
        </Link>
        <ChevronRight className={cn("h-3.5 w-3.5 shrink-0 opacity-60", isRTL && "rotate-180")} />
        <span className="line-clamp-1 font-medium text-foreground">{title}</span>
      </nav>

      <header className="space-y-5">
        <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl lg:text-[2.5rem] lg:leading-tight">
          {title}
        </h1>

        <div
          dir="ltr"
          className={cn(
            "flex w-full flex-col gap-4 sm:flex-row sm:items-center",
            isRTL ? "items-end sm:flex-row-reverse" : "sm:justify-between",
          )}
        >
          <div
            dir={isRTL ? "rtl" : "ltr"}
            className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground"
          >
            {authorImage ? (
              <img
                src={authorImage}
                alt=""
                className="h-8 w-8 rounded-full object-cover"
              />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-foreground">
                {authorName.slice(0, 1)}
              </div>
            )}
            <span className="font-medium text-foreground">{authorName}</span>
            <span aria-hidden="true">•</span>
            <span>{categoryName}</span>
            {publishedLabel ? (
              <>
                <span aria-hidden="true">•</span>
                <span>{publishedLabel}</span>
              </>
            ) : null}
            <span aria-hidden="true">•</span>
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {blog.reading_time_minutes} {t("minRead")}
            </span>
          </div>

          <div
            dir={isRTL ? "rtl" : "ltr"}
            className="flex items-center gap-2"
          >
            <span className="text-sm text-muted-foreground">{t("share")}:</span>
            <ShareIconButton
              href={`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`}
              label="Facebook"
              className="bg-[#1877F2]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M14 8.2h2.4V5H14c-2.3 0-3.8 1.6-3.8 4v1.7H8.2V14h2V19h2.8v-5h2.2l.4-3.3h-2.6V9.2c0-.6.3-1 1-1z" />
              </svg>
            </ShareIconButton>
            <ShareIconButton
              href={`https://twitter.com/intent/tweet?url=${encodedUrl}&text=${encodedTitle}`}
              label="X"
              className="bg-[#1DA1F2]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M22 5.8c-.7.3-1.5.5-2.3.6A4 4 0 0 0 21.4 4c-.8.5-1.7.8-2.6 1a4 4 0 0 0-6.8 3.6A11.3 11.3 0 0 1 3.1 4.7a4 4 0 0 0 1.2 5.3 4 4 0 0 1-1.8-.5v.1a4 4 0 0 0 3.2 3.9 4 4 0 0 1-1.8.1 4 4 0 0 0 3.7 2.8A8 8 0 0 1 2 18.1a11.3 11.3 0 0 0 6.1 1.8c7.3 0 11.3-6.1 11.3-11.3v-.5A8 8 0 0 0 22 5.8z" />
              </svg>
            </ShareIconButton>
            <ShareIconButton
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedUrl}`}
              label="LinkedIn"
              className="bg-[#0A66C2]"
            >
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 fill-current" aria-hidden="true">
                <path d="M6.5 9H3.7v11.3h2.8V9zM5.1 3.7a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2zM20.3 13.2c0-2.4-1.3-4-3.7-4-1.3 0-2.2.7-2.6 1.4h-.1V9H11.3c0 .8 0 11.3 0 11.3h2.8v-6.3c0-.3 0-.7.1-1 .3-.7.9-1.4 2-1.4 1.4 0 2 1.1 2 2.6v6.1h2.8v-6.3z" />
              </svg>
            </ShareIconButton>
            <ShareIconButton
              href={`https://wa.me/?text=${encodedTitle}%20${encodedUrl}`}
              label="WhatsApp"
              className="bg-[#25D366]"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4 fill-current" aria-hidden="true">
                <path d="M12 2.1A9.9 9.9 0 0 0 3.4 17l-1.1 4 4.1-1.1A9.9 9.9 0 1 0 12 2.1zm5.7 14.1c-.2.7-1.3 1.2-1.8 1.3-.5.1-1 .2-3.4-.7-3-1.1-5-4.4-5.1-4.6-.2-.2-1.3-1.8-1.3-3.4 0-1.6.8-2.4 1.1-2.7.3-.3.7-.4 1-.4h.7c.2 0 .5 0 .7.6l1 2.4c.1.2.1.4 0 .6l-.4.7c-.1.2-.3.4-.1.7.2.3.7 1.2 1.5 1.9 1 .9 1.9 1.2 2.2 1.3.3.1.5.1.7-.1l.8-1.1c.2-.2.4-.2.7-.1l2.1 1c.2.1.4.2.5.3.1.2.1.8-.2 1.5z" />
              </svg>
            </ShareIconButton>
          </div>
        </div>
      </header>

      {heroImage ? (
        <div className="overflow-hidden rounded-2xl bg-muted">
          <img
            src={heroImage}
            alt={title}
            className="aspect-[16/9] w-full object-cover sm:aspect-[2.2/1]"
          />
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_17.5rem] lg:gap-12">
        <article
          className={cn(
            "prose prose-base max-w-none prose-headings:font-bold prose-headings:tracking-tight prose-headings:text-foreground",
            "prose-p:leading-7 prose-p:text-muted-foreground",
            "prose-strong:text-foreground",
            "prose-li:text-muted-foreground",
            isRTL && "prose-rtl",
          )}
        >
          <MarkdownContent
            value={body}
            components={{
              p: ({ children }) => (
                <p className="mb-5 text-[1.05rem] leading-8 text-muted-foreground last:mb-0">
                  {children}
                </p>
              ),
              h1: ({ children }) => (
                <h2 className="mb-4 mt-10 text-2xl font-bold text-foreground first:mt-0">
                  {children}
                </h2>
              ),
              h2: ({ children }) => (
                <h2 className="mb-4 mt-10 text-xl font-bold text-foreground first:mt-0">
                  {children}
                </h2>
              ),
              h3: ({ children }) => (
                <h3 className="mb-3 mt-8 text-lg font-semibold text-foreground first:mt-0">
                  {children}
                </h3>
              ),
              ul: ({ children }) => (
                <ul className="mb-5 list-disc space-y-2 ps-5 text-muted-foreground">
                  {children}
                </ul>
              ),
              ol: ({ children }) => (
                <ol className="mb-5 list-decimal space-y-2 ps-5 text-muted-foreground">
                  {children}
                </ol>
              ),
              li: ({ children }) => (
                <li className="text-[1.05rem] leading-8 text-muted-foreground">{children}</li>
              ),
              strong: ({ children }) => (
                <strong className="font-semibold text-foreground">{children}</strong>
              ),
              em: ({ children }) => <em className="italic">{children}</em>,
              blockquote: ({ children }) => (
                <blockquote className="my-8 rounded-2xl border-0 bg-pink-50 px-6 py-5 not-italic dark:bg-pink-950/30">
                  <div className="text-lg font-semibold leading-relaxed text-pink-600 dark:text-pink-400 [&_p]:mb-0 [&_p]:text-inherit">
                    {children}
                  </div>
                </blockquote>
              ),
            }}
          />
        </article>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <section className="rounded-2xl bg-muted/60 p-5">
            <h2 className="mb-4 text-base font-bold text-foreground">
              {t("aboutTheAuthor")}
            </h2>
            <div className="flex items-start gap-3">
              {authorImage ? (
                <img
                  src={authorImage}
                  alt=""
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-muted text-sm font-medium">
                  {authorName.slice(0, 1)}
                </div>
              )}
              <div className="min-w-0 space-y-1.5">
                <p className="font-semibold text-pink-600">{authorName}</p>
                {authorBio ? (
                  <p className="text-sm leading-6 text-muted-foreground line-clamp-5">
                    {authorBio}
                  </p>
                ) : null}
              </div>
            </div>
            <Link
              to="/articles"
              className="mt-4 inline-flex text-sm font-medium text-pink-600 hover:text-pink-700"
            >
              {t("viewAllPosts")} →
            </Link>
          </section>

          {blog.related.length > 0 ? (
            <section className="rounded-2xl bg-muted/60 p-5">
              <h2 className="mb-4 text-base font-bold text-foreground">
                {t("relatedArticles")}
              </h2>
              <ul className="space-y-4">
                {blog.related.map((related) => {
                  const relatedTitle =
                    language === "ar" ? related.title_ar : related.title;
                  const relatedImage =
                    related.thumbnail_image_url ?? related.image_url;
                  const relatedDate = related.publishedAt
                    ? format(new Date(related.publishedAt), "d MMM yyyy", {
                        locale: dateLocale,
                      })
                    : null;

                  return (
                    <li key={related._id}>
                      <Link
                        to={`/articles/${related.slug}`}
                        className="group flex gap-3"
                      >
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-muted">
                          {relatedImage ? (
                            <img
                              src={relatedImage}
                              alt=""
                              className="h-full w-full object-cover transition-transform group-hover:scale-105"
                            />
                          ) : null}
                        </div>
                        <div className="min-w-0 space-y-1">
                          <p className="line-clamp-2 text-sm font-semibold leading-snug text-foreground group-hover:text-pink-600">
                            {relatedTitle}
                          </p>
                          {relatedDate ? (
                            <p className="text-xs text-muted-foreground">{relatedDate}</p>
                          ) : null}
                        </div>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </section>
          ) : null}
        </aside>
      </div>
    </div>
  );
};

export default UserBlogDetail;
