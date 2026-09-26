// Hand-written to match supabase/migrations/*.sql. Once the Supabase CLI is
// linked to the project, regenerate this file with:
//   supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type Sport = "hockey" | "football";
// "mixed" jen u Náhodné ligy -- zápasy pochází z různých lig, každý má
// vlastní `matches.sport` (viz níže), sport na competition slouží jen
// jako signál appce/sync-results, že jde o tenhle zvláštní případ.
export type CompetitionSport = Sport | "mixed";
export type CompetitionStatus = "active" | "archived";
export type MatchStatus = "scheduled" | "live" | "finished" | "postponed";
// public = dnešní oficiální soutěže (vidí každý přihlášený), private =
// hecovačka (jen tvůrce a participanti), viz
// 20260914090000_competitions_hecovacky.sql.
export type CompetitionVisibility = "public" | "private";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
          badges_seen_through: string;
          email_reminders_enabled: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          display_name: string;
          avatar_url?: string | null;
        };
        Update: {
          display_name?: string;
          avatar_url?: string | null;
          badges_seen_through?: string;
          email_reminders_enabled?: boolean;
        };
        Relationships: [];
      };
      competitions: {
        Row: {
          id: string;
          name: string;
          sport: CompetitionSport;
          status: CompetitionStatus;
          points_exact: number;
          points_winner: number;
          points_total_goals: number;
          points_overtime: number;
          scrape_source: string | null;
          scrape_path: string | null;
          logo_url: string | null;
          description: string | null;
          visibility: CompetitionVisibility;
          start_date: string | null;
          end_date: string | null;
          max_matches_per_day: number | null;
          invite_token: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sport: CompetitionSport;
          status?: CompetitionStatus;
          points_exact?: number;
          points_winner?: number;
          points_total_goals?: number;
          points_overtime?: number;
          scrape_source?: string | null;
          scrape_path?: string | null;
          logo_url?: string | null;
          description?: string | null;
          visibility?: CompetitionVisibility;
          start_date?: string | null;
          end_date?: string | null;
          max_matches_per_day?: number | null;
          invite_token?: string | null;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          sport?: CompetitionSport;
          status?: CompetitionStatus;
          points_exact?: number;
          points_winner?: number;
          points_total_goals?: number;
          points_overtime?: number;
          scrape_source?: string | null;
          scrape_path?: string | null;
          logo_url?: string | null;
          description?: string | null;
          visibility?: CompetitionVisibility;
          start_date?: string | null;
          end_date?: string | null;
          max_matches_per_day?: number | null;
          invite_token?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competitions_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      matches: {
        Row: {
          id: string;
          competition_id: string;
          external_id: string | null;
          home_team: string;
          away_team: string;
          kickoff_at: string;
          status: MatchStatus;
          home_score: number | null;
          away_score: number | null;
          overtime_flag: boolean | null;
          // Jen u zápasů "mixed" competition (Náhodná liga) -- viz
          // migrace 20260830090000_random_league.sql. Jinak null a
          // appka použije competition.sport.
          sport: Sport | null;
          source_scrape_path: string | null;
          // Jen u zápasů zkopírovaných do hecovačky -- FK na
          // originální řádek, viz
          // 20260914090100_matches_source_match_id.sql.
          source_match_id: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          external_id?: string | null;
          home_team: string;
          away_team: string;
          kickoff_at: string;
          status?: MatchStatus;
          home_score?: number | null;
          away_score?: number | null;
          overtime_flag?: boolean | null;
          sport?: Sport | null;
          source_scrape_path?: string | null;
          source_match_id?: string | null;
        };
        Update: {
          external_id?: string | null;
          home_team?: string;
          away_team?: string;
          kickoff_at?: string;
          status?: MatchStatus;
          home_score?: number | null;
          away_score?: number | null;
          overtime_flag?: boolean | null;
          sport?: Sport | null;
          source_scrape_path?: string | null;
          source_match_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "matches_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "matches_source_match_id_fkey";
            columns: ["source_match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
        ];
      };
      predictions: {
        Row: {
          id: string;
          match_id: string;
          user_id: string;
          predicted_home_score: number;
          predicted_away_score: number;
          predicted_overtime_flag: boolean | null;
          is_locked: boolean;
          points: number | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          match_id: string;
          user_id: string;
          predicted_home_score: number;
          predicted_away_score: number;
          predicted_overtime_flag?: boolean | null;
        };
        Update: {
          predicted_home_score?: number;
          predicted_away_score?: number;
          predicted_overtime_flag?: boolean | null;
        };
        Relationships: [
          {
            foreignKeyName: "predictions_match_id_fkey";
            columns: ["match_id"];
            isOneToOne: false;
            referencedRelation: "matches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "predictions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      competition_participants: {
        Row: {
          competition_id: string;
          user_id: string;
          joined_at: string;
          email_reminders_enabled: boolean;
          // Vyplněno jen když participanta přidal někdo jiný (tvůrce
          // hecovačky) -- viz
          // 20260914090300_competition_participants_hecovacky.sql.
          added_by: string | null;
          notified_at: string | null;
          // Kdy hráč naposledy viděl chat hecovačky -- NULL = nikdy
          // (viz 20260925130000_hecovacka_chat.sql).
          chat_last_read_at: string | null;
        };
        Insert: {
          competition_id: string;
          user_id: string;
          email_reminders_enabled?: boolean;
          added_by?: string | null;
          notified_at?: string | null;
          chat_last_read_at?: string | null;
        };
        Update: {
          email_reminders_enabled?: boolean;
          notified_at?: string | null;
          chat_last_read_at?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "competition_participants_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_participants_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "competition_participants_added_by_fkey";
            columns: ["added_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      hecovacka_sources: {
        Row: {
          hecovacka_id: string;
          source_competition_id: string;
        };
        Insert: {
          hecovacka_id: string;
          source_competition_id: string;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "hecovacka_sources_hecovacka_id_fkey";
            columns: ["hecovacka_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hecovacka_sources_source_competition_id_fkey";
            columns: ["source_competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
        ];
      };
      hecovacka_messages: {
        Row: {
          id: string;
          competition_id: string;
          user_id: string;
          body: string | null;
          gif_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          competition_id: string;
          user_id: string;
          body?: string | null;
          gif_url?: string | null;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "hecovacka_messages_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "hecovacka_messages_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      weekly_badges: {
        Row: {
          competition_id: string;
          week_start: string;
          user_id: string;
          points: number;
          awarded_at: string;
        };
        Insert: {
          competition_id: string;
          week_start: string;
          user_id: string;
          points: number;
        };
        Update: Record<string, never>;
        Relationships: [
          {
            foreignKeyName: "weekly_badges_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "weekly_badges_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      team_logos: {
        Row: {
          competition_id: string;
          team_name: string;
          logo_url: string;
        };
        Insert: {
          competition_id: string;
          team_name: string;
          logo_url: string;
        };
        Update: {
          logo_url?: string;
        };
        Relationships: [
          {
            foreignKeyName: "team_logos_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: Record<string, never>;
    Functions: {
      create_hecovacka: {
        Args: {
          p_name: string;
          p_description: string | null;
          p_start_date: string | null;
          p_end_date: string;
          p_max_matches_per_day: number | null;
          p_source_competition_ids: string[];
          p_initial_participant_ids: string[];
        };
        Returns: string;
      };
      get_hecovacka_invite_preview: {
        Args: { p_token: string };
        Returns: { competition_id: string; name: string; description: string | null }[];
      };
      accept_hecovacka_invite: {
        Args: { p_token: string };
        Returns: string;
      };
      backfill_hecovacka_predictions_for_participant: {
        Args: { p_hecovacka_id: string; p_user_id: string };
        Returns: undefined;
      };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
