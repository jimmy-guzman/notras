import { type Theme } from "daisyui";

interface ThemeOptionsProps {
  theme: Theme;
  userTheme?: Theme;
}

export const ThemeOption = ({ theme, userTheme }: ThemeOptionsProps) => {
  return (
    <div className="dsy-form-control">
      <label className="dsy-label cursor-pointer gap-4">
        <span className="dsy-label-text capitalize">{theme}</span>
        <input
          type="radio"
          name="theme"
          className="theme-controller dsy-radio"
          value={theme}
          defaultChecked={userTheme === theme}
        />
      </label>
    </div>
  );
};
