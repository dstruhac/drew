// Hand-written to match supabase/migrations/*.sql. Once the Supabase CLI is
// linked to the project, regenerate this file with:
//   supabase gen types typescript --linked > src/lib/supabase/database.types.ts

export type Sport = "hockey" | "football";
export type CompetitionStatus = "active" | "archived";
export type MatchStatus = "scheduled" | "live" | "finished";

export interface Database {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string;
          avatar_url: string | null;
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
        };
        Relationships: [];
      };
      competitions: {
        Row: {
          id: string;
          name: string;
          sport: Sport;
          status: CompetitionStatus;
          points_exact: number;
          points_winner: number;
          points_total_goals: number;
          scrape_source: string | null;
          scrape_path: string | null;
          created_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          sport: Sport;
          status?: CompetitionStatus;
          points_exact?: number;
          points_winner?: number;
          points_total_goals?: number;
          scrape_source?: string | null;
          scrape_path?: string | null;
          created_by?: string | null;
        };
        Update: {
          name?: string;
          sport?: Sport;
          status?: CompetitionStatus;
          points_exact?: number;
          points_winner?: number;
          points_total_goals?: number;
          scrape_source?: string | null;
          scrape_path?: string | null;
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
        };
        Relationships: [
          {
            foreignKeyName: "matches_competition_id_fkey";
            columns: ["competition_id"];
            isOneToOne: false;
            referencedRelation: "competitions";
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
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}
