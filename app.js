// app.js

// Import required Node.js and Express modules
const express = require("express");
const fs = require("fs").promises;
const path = require("path");
const cors = require("cors");

// Create the Express application
const app = express();

// The server will run on port 5000
const PORT = 5000;

// The JSON file will be stored in the same directory as app.js
const DATA_FILE = path.join(__dirname, "courses.json");

// Allowed values for the course status field
const ALLOWED_STATUSES = ["Not Started", "In Progress", "Completed"];

// Middleware that allows Express to read JSON request bodies
app.use(cors());
app.use(express.json());

/*
  Create courses.json automatically if it does not exist.

  The file starts with an empty array because courses will be
  stored as an array of objects.
*/
async function initializeDataFile() {
  try {
    await fs.access(DATA_FILE);
  } catch (error) {
    // If the file does not exist, create it
    if (error.code === "ENOENT") {
      await fs.writeFile(DATA_FILE, "[]", "utf8");
      console.log("courses.json was created automatically.");
    } else {
      throw error;
    }
  }
}

/*
  Read and parse all courses from courses.json.
*/
async function readCourses() {
  try {
    const fileContents = await fs.readFile(DATA_FILE, "utf8");

    // If the file is empty, treat it as an empty course list
    if (!fileContents.trim()) {
      return [];
    }

    return JSON.parse(fileContents);
  } catch (error) {
    // JSON parsing errors or file read errors are handled by the route
    throw new Error(`Unable to read courses.json: ${error.message}`);
  }
}

/*
  Write the complete courses array to courses.json.
*/
async function writeCourses(courses) {
  try {
    await fs.writeFile(DATA_FILE, JSON.stringify(courses, null, 2), "utf8");
  } catch (error) {
    throw new Error(`Unable to write courses.json: ${error.message}`);
  }
}

/*
  Check whether a date uses the YYYY-MM-DD format and represents
  a real calendar date.
*/
function isValidDate(dateString) {
  // First check the required format
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return false;
  }

  const [year, month, day] = dateString.split("-").map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/*
  Return a list of missing required fields.

  This helper is used when creating and updating courses.
*/
function getMissingFields(courseData) {
  const requiredFields = ["name", "description", "target_date", "status"];

  return requiredFields.filter((field) => {
    return (
      courseData[field] === undefined ||
      courseData[field] === null ||
      String(courseData[field]).trim() === ""
    );
  });
}

/*
  Validate the fields that can be supplied by the client.
*/
function validateCourseFields(courseData) {
  const errors = [];

  if (courseData.status && !ALLOWED_STATUSES.includes(courseData.status)) {
    errors.push(`status must be one of: ${ALLOWED_STATUSES.join(", ")}`);
  }

  if (courseData.target_date && !isValidDate(courseData.target_date)) {
    errors.push("target_date must use the format YYYY-MM-DD");
  }

  return errors;
}

/*
  Find the next available course ID.

  New IDs start at 1. The next ID is one greater than the
  highest existing ID.
*/
function getNextCourseId(courses) {
  if (courses.length === 0) {
    return 1;
  }

  const highestId = Math.max(
    ...courses.map((course) => Number(course.id) || 0),
  );

  return highestId + 1;
}

/*
  POST /api/courses

  Add a new course.
*/
app.post("/api/courses", async (req, res) => {
  try {
    const missingFields = getMissingFields(req.body);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Missing required fields",
        fields: missingFields,
      });
    }

    const validationErrors = validateCourseFields(req.body);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid course data",
        details: validationErrors,
      });
    }

    const courses = await readCourses();

    const newCourse = {
      id: getNextCourseId(courses),
      name: req.body.name.trim(),
      description: req.body.description.trim(),
      target_date: req.body.target_date,
      status: req.body.status,
      created_at: new Date().toISOString(),
    };

    courses.push(newCourse);

    await writeCourses(courses);

    res.status(201).json({
      message: "Course created successfully",
      course: newCourse,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to create course",
      details: error.message,
    });
  }
});

/*
  GET /api/courses

  Return all courses.
*/
app.get("/api/courses", async (req, res) => {
  try {
    const courses = await readCourses();

    res.status(200).json(courses);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to read courses",
      details: error.message,
    });
  }
});

/*
  GET /api/courses/:id

  Return one specific course.
*/
app.get("/api/courses/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId < 1) {
      return res.status(400).json({
        error: "Course ID must be a positive integer",
      });
    }

    const courses = await readCourses();

    const course = courses.find((item) => item.id === courseId);

    if (!course) {
      return res.status(404).json({
        error: "Course not found",
      });
    }

    res.status(200).json(course);
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to read course",
      details: error.message,
    });
  }
});

/*
  PUT /api/courses/:id

  Replace the editable details of an existing course.

  PUT requires all course fields:
  name, description, target_date, and status.
*/
app.put("/api/courses/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId < 1) {
      return res.status(400).json({
        error: "Course ID must be a positive integer",
      });
    }

    const missingFields = getMissingFields(req.body);

    if (missingFields.length > 0) {
      return res.status(400).json({
        error: "Missing required fields",
        fields: missingFields,
      });
    }

    const validationErrors = validateCourseFields(req.body);

    if (validationErrors.length > 0) {
      return res.status(400).json({
        error: "Invalid course data",
        details: validationErrors,
      });
    }

    const courses = await readCourses();

    const courseIndex = courses.findIndex((course) => course.id === courseId);

    if (courseIndex === -1) {
      return res.status(404).json({
        error: "Course not found",
      });
    }

    /*
      Keep the original ID and created_at values.
      Only the editable course fields are replaced.
    */
    const updatedCourse = {
      id: courses[courseIndex].id,
      name: req.body.name.trim(),
      description: req.body.description.trim(),
      target_date: req.body.target_date,
      status: req.body.status,
      created_at: courses[courseIndex].created_at,
    };

    courses[courseIndex] = updatedCourse;

    await writeCourses(courses);

    res.status(200).json({
      message: "Course updated successfully",
      course: updatedCourse,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to update course",
      details: error.message,
    });
  }
});

/*
  DELETE /api/courses/:id

  Delete one specific course.
*/
app.delete("/api/courses/:id", async (req, res) => {
  try {
    const courseId = Number(req.params.id);

    if (!Number.isInteger(courseId) || courseId < 1) {
      return res.status(400).json({
        error: "Course ID must be a positive integer",
      });
    }

    const courses = await readCourses();

    const courseIndex = courses.findIndex((course) => course.id === courseId);

    if (courseIndex === -1) {
      return res.status(404).json({
        error: "Course not found",
      });
    }

    const deletedCourse = courses.splice(courseIndex, 1)[0];

    await writeCourses(courses);

    res.status(200).json({
      message: "Course deleted successfully",
      course: deletedCourse,
    });
  } catch (error) {
    console.error(error);

    res.status(500).json({
      error: "Unable to delete course",
      details: error.message,
    });
  }
});

/*
  Handle malformed JSON request bodies.

  For example, this catches invalid JSON sent in a POST or PUT request.
*/
app.use((error, req, res, next) => {
  if (error instanceof SyntaxError && error.status === 400) {
    return res.status(400).json({
      error: "Request body contains invalid JSON",
    });
  }

  next(error);
});

/*
  Handle routes that do not exist.
*/
app.use((req, res) => {
  res.status(404).json({
    error: "Endpoint not found",
  });
});

/*
  Start the server only after courses.json has been created or verified.
*/
async function startServer() {
  try {
    await initializeDataFile();

    app.listen(PORT, () => {
      console.log(`CodeCraftHub API is running on port ${PORT}`);
      console.log(`http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Could not start the server:", error.message);
    process.exit(1);
  }
}

// Start the application
startServer();
