import { Elysia, t } from "elysia";
import { usageService } from "../services/usage.service";

export const statsPlugin = (app: Elysia) =>
  app
    .get("/api/stats/overview", ({ query: { days } }) => {
      return usageService.getOverview(days ? Number(days) : 30);
    })
    .get("/api/stats/by-provider", ({ query: { days } }) => {
      return usageService.getByProvider(days ? Number(days) : 30);
    })
    .get("/api/stats/by-model", ({ query: { days } }) => {
      return usageService.getByModel(days ? Number(days) : 30);
    })
    .get("/api/stats/daily", ({ query: { days } }) => {
      return usageService.getDailyStats(days ? Number(days) : 30);
    })
    .get("/api/stats/tps", () => {
      return usageService.getAllModelTps();
    });
