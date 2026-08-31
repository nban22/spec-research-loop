import { Controller, Get, Param, Post } from '@nestjs/common';
import { UserId } from '../common/http.decorators';
import { ProjectService } from '../project/project.service';
import { CredibilityService } from './credibility.service';

/**
 * Route của #1. Đặt trong `src/sources/**` — ranh giới sở hữu của làn A cho phép thư mục này,
 * còn `project.controller.ts` (nơi các route `/projects/:id/sources` đang ở) là file dùng chung
 * mà ba làn dễ đụng nhau nhất. Nest cho nhiều controller cùng prefix nên không cần sửa file đó.
 */
@Controller()
export class SourcesController {
  constructor(
    private readonly credibility: CredibilityService,
    private readonly projects: ProjectService,
  ) {}

  @Get('projects/:id/credibility')
  async overview(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    return this.credibility.overview(id);
  }

  /**
   * Chấm lại bằng tay. Đồng bộ vì tầng chấm điểm là luật thuần, 0 token — không cần job.
   * Có route này để bật cờ trên dự án cũ là dùng được ngay, khỏi phải đi tìm nguồn lại.
   */
  @Post('projects/:id/credibility/rescore')
  async rescore(@Param('id') id: string, @UserId() userId: string) {
    await this.projects.assertOwned(id, userId);
    const scored = await this.credibility.rescoreProject(id);
    return { scored };
  }
}
