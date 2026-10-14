import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Course, FaqItem } from '../lib/types';
import { courseLessons, courseMinutes } from '../lib/store';
import { Icon } from './Icon';
import { AccordionItem } from './ui';
import { CourseArt, Price, ProvisionalBadge } from './brand';

export function CourseCard({ course, headingLevel = 3, index }: { course: Course; headingLevel?: 2 | 3; index?: number }) {
  const lessons = courseLessons(course);
  const H = `h${headingLevel}` as 'h2' | 'h3';
  return (
    <article className="course-card">
      {index !== undefined && <span className="course-num" aria-hidden="true">No. {String(index + 1).padStart(2, '0')}</span>}
      <CourseArt course={course} />
      <div className="course-card-body">
        <div className="badge-row">
          <ProvisionalBadge show={course.titleProvisional} children="Sample title" />
          {course.curriculumSample && <span className="badge badge-muted">Sample curriculum</span>}
        </div>
        <H><Link to={`/courses/${course.slug}`}>{course.title}</Link></H>
        <p>{course.tagline}</p>
        <div className="course-meta">
          <span><Icon name="video" size={16} />{lessons.length} prerecorded lessons</span>
          <span><Icon name="clock" size={16} />~{Math.round(courseMinutes(course) / 60 * 10) / 10} hrs total</span>
          <span><Icon name="calendar" size={16} />{course.accessMonths}-month access</span>
        </div>
        <div className="course-card-foot">
          <Price course={course} />
          <Link to={`/courses/${course.slug}`} className="btn btn-secondary btn-sm" aria-label={`View course: ${course.title}`}>
            View course <Icon name="arrowRight" size={16} />
          </Link>
        </div>
      </div>
    </article>
  );
}

export function Curriculum({ course, renderLesson }: { course: Course; renderLesson?: (lessonId: string) => ReactNode }) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => ({ [course.modules[0]?.id ?? '']: true }));
  const allOpen = course.modules.every((m) => open[m.id]);
  return (
    <div>
      <div className="row-between" style={{ marginBottom: 14 }}>
        <span className="muted small">{course.modules.length} modules · {courseLessons(course).length} lessons</span>
        <button type="button" className="link-btn small" onClick={() => setOpen(Object.fromEntries(course.modules.map((m) => [m.id, !allOpen])))}>
          {allOpen ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      {course.modules.map((m, i) => {
        const lessons = m.lessons.filter((l) => l.published);
        if (!lessons.length) return null;
        const mins = lessons.reduce((s, l) => s + l.durationMin, 0);
        const id = `mod-${m.id}`;
        return (
          <div className="module" key={m.id}>
            <button type="button" className="module-head" aria-expanded={!!open[m.id]} aria-controls={id} onClick={() => setOpen((o) => ({ ...o, [m.id]: !o[m.id] }))}>
              <span className="t">Module {i + 1}: {m.title}</span>
              <span className="m">{lessons.length} lessons · {mins} min</span>
              <Icon name="chevronDown" />
            </button>
            <ul className="lesson-list" id={id} hidden={!open[m.id]}>
              {lessons.map((l) => (
                <li className="lesson-row" key={l.id}>
                  <Icon name={l.preview ? 'play' : 'lock'} size={16} />
                  <span className="t">{l.title}{l.preview && <> <span className="badge badge-sage" style={{ marginLeft: 6 }}>Free preview</span></>}</span>
                  {renderLesson?.(l.id)}
                  <span className="d">{l.durationMin} min</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export function FaqList({ items, showCategory }: { items: FaqItem[]; showCategory?: boolean }) {
  return (
    <div className="accordion">
      {items.map((f) => (
        <AccordionItem
          key={f.id}
          title={<>{f.question}{f.draft && <span className="badge badge-warn" style={{ marginLeft: 10 }}>Draft</span>}{showCategory && <span className="sr-only"> ({f.category})</span>}</>}
        >
          <p>{f.answer}</p>
        </AccordionItem>
      ))}
    </div>
  );
}
