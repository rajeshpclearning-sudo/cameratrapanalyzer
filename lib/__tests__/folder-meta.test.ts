import { parseTrapFolderName } from "../folder-meta";

describe("parseTrapFolderName", () => {
  test("full NR example", () => {
    expect(parseTrapFolderName("CN_7_FFS_2_23Feb2026_NR_2021_31")).toEqual({
      sourceFile: "CN_7_FFS_2_23Feb2026",
      sennaStatus: "Not Removed",
      yearOfRemoval: "2021",
      trapNights: "31",
    });
  });

  test("full R example", () => {
    expect(parseTrapFolderName("CN_7_FFS_2_23Feb2026_R_2020_15")).toEqual({
      sourceFile: "CN_7_FFS_2_23Feb2026",
      sennaStatus: "Removed",
      yearOfRemoval: "2020",
      trapNights: "15",
    });
  });

  test("partial folder name", () => {
    expect(parseTrapFolderName("CN_7_FFS")).toEqual({
      sourceFile: "CN_7_FFS",
      sennaStatus: "",
      yearOfRemoval: "",
      trapNights: "",
    });
  });

  test("strips parent path", () => {
    expect(
      parseTrapFolderName("/Volumes/card/CN_7_FFS_2_23Feb2026_NR_2021_31"),
    ).toMatchObject({
      sourceFile: "CN_7_FFS_2_23Feb2026",
      sennaStatus: "Not Removed",
    });
  });
});
